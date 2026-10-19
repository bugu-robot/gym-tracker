import { db, type GymDB, validWeight } from "./db";
import {
  EQUIPMENT,
  GROUPS,
  MUSCLES,
  type Backup,
  type Exercise,
  type History,
} from "./types";
const bad = () => {
  throw new Error("備份格式不正確，原有資料未變更。");
};
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : bad();
const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v : bad();
const weight = (v: unknown): number =>
  typeof v === "number" && validWeight(v) ? v : bad();
const time = (v: unknown): number =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 8640000000000000
    ? v
    : bad();
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function validateBackup(raw: unknown): Backup {
  const v = obj(raw);
  if (
    v.app !== "gym-weight-tracker" ||
    v.version !== 1 ||
    !Array.isArray(v.exercises) ||
    !Array.isArray(v.history) ||
    v.exercises.length > 5000 ||
    v.history.length > 50000
  )
    return bad();
  const ids = new Set<string>(),
    hids = new Set<string>();
  const exercises: Exercise[] = v.exercises.map((value) => {
    const e = obj(value),
      order = obj(e.order),
      id = str(e.id, 100);
    if (
      ids.has(id) ||
      typeof e.custom !== "boolean" ||
      !Object.hasOwn(EQUIPMENT, String(e.equipment)) ||
      !MUSCLES.includes(e.muscle as never) ||
      !Array.isArray(e.groups) ||
      e.groups.some((g) => !GROUPS.includes(g)) ||
      new Set(e.groups).size !== e.groups.length
    )
      return bad();
    ids.add(id);
    const positions = Object.fromEntries(
      GROUPS.map((g) => [g, time(order[g])]),
    ) as Exercise["order"];
    return {
      id,
      zh: str(e.zh, 80),
      en: str(e.en, 120),
      custom: e.custom,
      equipment: e.equipment as Exercise["equipment"],
      muscle: e.muscle as Exercise["muscle"],
      groups: e.groups as Exercise["groups"],
      order: positions,
      weight: e.weight === null ? null : weight(e.weight),
    };
  });
  const history: History[] = v.history.map((value) => {
    const h = obj(value),
      id = str(h.id, 100),
      exerciseId = str(h.exerciseId, 100);
    if (hids.has(id) || !ids.has(exerciseId)) return bad();
    hids.add(id);
    const at = time(h.at),
      startedAt = time(h.startedAt);
    if (startedAt > at) return bad();
    return {
      id,
      exerciseId,
      at,
      startedAt,
      oldWeight: h.oldWeight === null ? null : weight(h.oldWeight),
      newWeight: weight(h.newWeight),
      session: str(h.session, 100),
    };
  });
  const settings = obj(v.settings),
    step = weight(settings.step);
  if (settings.id !== "preferences" || step <= 0 || step > 100) return bad();
  const exportedAt = str(v.exportedAt, 40);
  if (!Number.isFinite(Date.parse(exportedAt))) return bad();
  return {
    app: "gym-weight-tracker",
    version: 1,
    exportedAt,
    exercises,
    history,
    settings: { id: "preferences", step },
  };
}
export async function exportBackup(database: GymDB = db): Promise<Backup> {
  return database.transaction(
    "r",
    database.exercises,
    database.history,
    database.settings,
    async () => ({
      app: "gym-weight-tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      exercises: await database.exercises.toArray(),
      history: await database.history.toArray(),
      settings: (await database.settings.get("preferences"))!,
    }),
  );
}
export async function importBackup(raw: unknown, database: GymDB = db) {
  const data = validateBackup(raw);
  await database.transaction(
    "rw",
    database.exercises,
    database.history,
    database.settings,
    async () => {
      await database.exercises.clear();
      await database.history.clear();
      await database.settings.clear();
      await database.exercises.bulkAdd(data.exercises);
      await database.history.bulkAdd(data.history);
      await database.settings.put(data.settings);
    },
  );
}
