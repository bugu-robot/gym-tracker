import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import {
  changeWeight,
  deleteCustom,
  GymDB,
  initialize,
  moveExercise,
  parseWeight,
  toggleGroup,
} from "./db";
let db: GymDB;
beforeEach(async () => {
  db = new GymDB(`test-${crypto.randomUUID()}`);
  await initialize(db);
});
afterEach(async () => {
  await db.delete();
});
const id = catalog[0].id;
it("seeds 80+ unique bilingual exercises across every equipment and muscle", () => {
  expect(catalog.length).toBeGreaterThanOrEqual(80);
  expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
  expect(new Set(catalog.map((e) => e.en)).size).toBe(catalog.length);
  expect(new Set(catalog.map((e) => e.equipment)).size).toBe(5);
  expect(new Set(catalog.map((e) => e.muscle)).size).toBe(6);
  expect(catalog.every((e) => e.zh && e.en)).toBe(true);
});
it("initialization is idempotent and preserves edited weights", async () => {
  await changeWeight(id, { value: 20 }, "s", db);
  await initialize(db);
  expect(await db.exercises.count()).toBe(catalog.length);
  expect((await db.exercises.get(id))?.weight).toBe(20);
});
it("persists across database close and reopen", async () => {
  await changeWeight(id, { value: 25 }, "s", db);
  db.close();
  await db.open();
  expect((await db.exercises.get(id))?.weight).toBe(25);
});
it("merges rapid changes while preserving first weight and final value", async () => {
  await changeWeight(id, { value: 10 }, "s", db, 1000);
  await changeWeight(id, { delta: 2.5 }, "s", db, 2000);
  await changeWeight(id, { delta: 2.5 }, "s", db, 3000);
  expect(await db.history.count()).toBe(1);
  expect(await db.history.toCollection().first()).toMatchObject({
    oldWeight: null,
    newWeight: 15,
    startedAt: 1000,
    at: 3000,
  });
});
it("creates separate entries after gap or a different app session", async () => {
  await changeWeight(id, { value: 10 }, "s", db, 1000);
  await changeWeight(id, { value: 15 }, "s", db, 4001);
  await changeWeight(id, { value: 20 }, "new", db, 4500);
  expect(await db.history.count()).toBe(3);
});
it("removes a burst that returns to its original weight", async () => {
  await changeWeight(id, { value: 10 }, "s", db, 1000);
  await changeWeight(id, { value: 20 }, "s", db, 4000);
  await changeWeight(id, { value: 10 }, "s", db, 4500);
  expect(await db.history.count()).toBe(1);
});
it("serializes concurrent taps without losing increments", async () => {
  await Promise.all(
    Array.from({ length: 20 }, () => changeWeight(id, { delta: 0.1 }, "s", db)),
  );
  expect((await db.exercises.get(id))?.weight).toBe(2);
  expect(await db.history.count()).toBe(1);
});
it("does not create history for unchanged weight", async () => {
  await changeWeight(id, { value: 0 }, "s", db);
  await changeWeight(id, { value: 0 }, "s", db);
  expect(await db.history.count()).toBe(1);
});
it("rejects invalid weight without changing exercise or history", async () => {
  for (const value of [-1, Infinity, NaN, 2001, 1.234])
    await expect(changeWeight(id, { value }, "s", db)).rejects.toThrow();
  expect((await db.exercises.get(id))?.weight).toBe(null);
  expect(await db.history.count()).toBe(0);
});
it("reorders within one PPL group only", async () => {
  const list = (
    await db.exercises.where("groups").equals("Push").toArray()
  ).sort((a, b) => a.order.Push - b.order.Push);
  const pull = list[0].order.Pull;
  await moveExercise(list[0].id, "Push", 1, db);
  expect((await db.exercises.get(list[0].id))?.order.Push).toBe(1);
  expect((await db.exercises.get(list[1].id))?.order.Push).toBe(0);
  expect((await db.exercises.get(list[0].id))?.order.Pull).toBe(pull);
});
it("adds and removes group membership without removing weight", async () => {
  await changeWeight(id, { value: 10 }, "s", db);
  await toggleGroup(id, "Pull", db);
  await toggleGroup(id, "Push", db);
  expect((await db.exercises.get(id))?.groups).toEqual(["Pull"]);
  expect((await db.exercises.get(id))?.weight).toBe(10);
});
it("deletes custom exercise with its history and protects presets", async () => {
  await db.exercises.add({ ...catalog[0], id: "custom", custom: true });
  await changeWeight("custom", { value: 10 }, "s", db);
  await deleteCustom("custom", db);
  expect(await db.exercises.get("custom")).toBeUndefined();
  expect(await db.history.count()).toBe(0);
  await expect(deleteCustom(id, db)).rejects.toThrow();
});
it("migrates legacy v1 history without losing data", async () => {
  const name = `legacy-${crypto.randomUUID()}`,
    old = new Dexie(name);
  old.version(1).stores({
    exercises: "id, *groups, equipment, muscle",
    history: "id, exerciseId, at",
    settings: "id",
  });
  await old.table("history").add({
    id: "h",
    exerciseId: id,
    oldWeight: 0,
    newWeight: 10,
    at: 100,
    session: "s",
  });
  old.close();
  const migrated = new GymDB(name);
  await migrated.open();
  expect(await migrated.history.get("h")).toMatchObject({
    startedAt: 100,
    newWeight: 10,
  });
  await migrated.delete();
});
describe("input parser", () => {
  it.each(["", " ", "-1", "1e2", "Infinity", "1.234", "2,5", "2001"])(
    "rejects %s",
    (raw) => expect(parseWeight(raw)).toBe(null),
  );
  it.each([
    ["0", 0],
    ["2.5", 2.5],
    [".25", 0.25],
    ["2000", 2000],
    ["1.", 1],
  ] as const)("accepts %s", (raw, value) =>
    expect(parseWeight(raw)).toBe(value),
  );
});
