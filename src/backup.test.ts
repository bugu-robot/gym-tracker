import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportBackup, importBackup, validateBackup } from "./backup";
import { changeWeight, GymDB, initialize } from "./db";
import { catalog } from "./catalog";
let db: GymDB;
beforeEach(async () => {
  db = new GymDB(`backup-${crypto.randomUUID()}`);
  await initialize(db);
});
afterEach(async () => {
  await db.delete();
});
it("round trips all data including history, lists, and settings", async () => {
  await changeWeight(catalog[0].id, { value: 22.5 }, "s", db);
  await db.settings.put({ id: "preferences", step: 0.5 });
  const backup = await exportBackup(db);
  await db.exercises.clear();
  await db.history.clear();
  await importBackup(JSON.parse(JSON.stringify(backup)), db);
  const restored = await exportBackup(db);
  expect(restored.exercises).toEqual(backup.exercises);
  expect(restored.history).toEqual(backup.history);
  expect(restored.settings.step).toBe(0.5);
});
it("rejects corrupt and future backups without erasing existing data", async () => {
  const good = await exportBackup(db);
  const mutations = [
    { ...good, version: 2 },
    { ...good, app: "other" },
    { ...good, exercises: [...good.exercises, good.exercises[0]] },
    { ...good, exercises: [{ ...good.exercises[0], weight: -5 }] },
    { ...good, exercises: [{ ...good.exercises[0], groups: ["Nope"] }] },
    { ...good, settings: { id: "preferences", step: 0 } },
    { ...good, exercises: [{ ...good.exercises[0], equipment: "__proto__" }] },
    {
      ...good,
      history: [
        {
          id: "h",
          exerciseId: "missing",
          oldWeight: 0,
          newWeight: 1,
          at: 1,
          startedAt: 1,
          session: "s",
        },
      ],
    },
  ];
  for (const bad of mutations)
    await expect(importBackup(bad, db)).rejects.toThrow();
  expect((await exportBackup(db)).exercises).toEqual(good.exercises);
});
it("rolls back every table if a restore write fails", async () => {
  const before = await exportBackup(db),
    next = { ...before, exercises: [] };
  const spy = vi
    .spyOn(db.settings, "put")
    .mockRejectedValueOnce(new Error("disk full"));
  await expect(importBackup(next, db)).rejects.toThrow("disk full");
  spy.mockRestore();
  expect((await exportBackup(db)).exercises).toEqual(before.exercises);
});
it("preserves intentionally empty library across app initialization", async () => {
  const b = await exportBackup(db);
  await importBackup({ ...b, exercises: [], history: [] }, db);
  await initialize(db);
  expect(await db.exercises.count()).toBe(0);
});
it("strips unknown fields before storing imported data", async () => {
  const b = await exportBackup(db);
  const parsed = validateBackup({
    ...b,
    exercises: [{ ...b.exercises[0], unexpected: "x" }],
  });
  expect(parsed.exercises[0]).not.toHaveProperty("unexpected");
});
