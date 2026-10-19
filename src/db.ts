import Dexie, { type Table } from "dexie";
import { catalog } from "./catalog";
import type { Exercise, Group, History, Settings } from "./types";
export const MERGE_MS = 2000;
export const DEFAULT_SETTINGS: Settings = { id: "preferences", step: 2.5 };
export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  history!: Table<History, string>;
  settings!: Table<Settings, string>;
  constructor(name = "gym-weight-tracker") {
    super(name);
    this.version(1).stores({
      exercises: "id, *groups, equipment, muscle",
      history: "id, exerciseId, at",
      settings: "id",
    });
    // Explicit migration path: v1 had no burst start timestamp.
    this.version(2)
      .stores({ history: "id, exerciseId, at, [exerciseId+at]" })
      .upgrade((tx) =>
        tx
          .table("history")
          .toCollection()
          .modify((row) => {
            row.startedAt ??= row.at;
          }),
      );
  }
}
export const db = new GymDB();
export async function initialize(database = db) {
  await database.transaction(
    "rw",
    database.exercises,
    database.settings,
    async () => {
      // A settings sentinel preserves intentionally empty libraries after backup restore.
      if (!(await database.settings.get("preferences"))) {
        if (!(await database.exercises.count()))
          await database.exercises.bulkAdd(catalog);
        await database.settings.put(DEFAULT_SETTINGS);
      }
    },
  );
}
export function validWeight(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 2000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}
export function parseWeight(raw: string): number | null {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw.trim())) return null;
  const value = Number(raw);
  return validWeight(value) ? value : null;
}
export async function changeWeight(
  id: string,
  change: { value: number } | { delta: number },
  session: string,
  database = db,
  now = Date.now(),
) {
  await database.transaction(
    "rw",
    database.exercises,
    database.history,
    async () => {
      const ex = await database.exercises.get(id);
      if (!ex) throw new Error("找不到動作，請重新開啟。");
      const value =
        "value" in change
          ? change.value
          : Math.round(((ex.weight ?? 0) + change.delta) * 100) / 100;
      if (!validWeight(value))
        throw new Error("重量須為 0 至 2000 kg，最多兩位小數。");
      if (value === ex.weight) return;
      const previous = await database.history
        .where("[exerciseId+at]")
        .between([id, Dexie.minKey], [id, Dexie.maxKey])
        .last();
      if (
        previous &&
        previous.session === session &&
        now - previous.at >= 0 &&
        now - previous.at <= MERGE_MS
      ) {
        if (previous.oldWeight === value)
          await database.history.delete(previous.id);
        else
          await database.history.update(previous.id, {
            newWeight: value,
            at: now,
          });
      } else {
        await database.history.add({
          id: crypto.randomUUID(),
          exerciseId: id,
          oldWeight: ex.weight,
          newWeight: value,
          at: now,
          startedAt: now,
          session,
        });
      }
      await database.exercises.update(id, { weight: value });
    },
  );
}
export async function toggleGroup(
  exerciseId: string,
  group: Group,
  database = db,
) {
  await database.transaction("rw", database.exercises, async () => {
    const ex = await database.exercises.get(exerciseId);
    if (!ex) return;
    const max = Math.max(
      -1,
      ...(await database.exercises.toArray()).map((e) => e.order[group]),
    );
    const included = ex.groups.includes(group);
    await database.exercises.update(ex.id, {
      groups: included
        ? ex.groups.filter((g) => g !== group)
        : [...ex.groups, group],
      order: { ...ex.order, [group]: included ? ex.order[group] : max + 1 },
    });
  });
}
export async function moveExercise(
  id: string,
  group: Group,
  direction: -1 | 1,
  database = db,
) {
  await database.transaction("rw", database.exercises, async () => {
    const list = (
      await database.exercises.where("groups").equals(group).toArray()
    ).sort(
      (a, b) => a.order[group] - b.order[group] || a.id.localeCompare(b.id),
    );
    const from = list.findIndex((e) => e.id === id),
      to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    for (let i = 0; i < list.length; i++)
      await database.exercises.update(list[i].id, {
        order: { ...list[i].order, [group]: i },
      });
  });
}
export async function deleteCustom(id: string, database = db) {
  await database.transaction(
    "rw",
    database.exercises,
    database.history,
    async () => {
      if (!(await database.exercises.get(id))?.custom)
        throw new Error("預設動作可從清單移除。");
      await database.history.where("exerciseId").equals(id).delete();
      await database.exercises.delete(id);
    },
  );
}
