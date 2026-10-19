export const GROUPS = ["Push", "Pull", "Legs"] as const;
export type Group = (typeof GROUPS)[number];
export const EQUIPMENT = {
  Machine: "機械式",
  Dumbbell: "啞鈴",
  Barbell: "槓鈴",
  Cable: "滑輪",
  Bodyweight: "徒手",
} as const;
export type Equipment = keyof typeof EQUIPMENT;
export const MUSCLES = ["胸", "背", "肩", "手臂", "腿", "核心"] as const;
export type Muscle = (typeof MUSCLES)[number];
export interface Exercise {
  id: string;
  zh: string;
  en: string;
  equipment: Equipment;
  muscle: Muscle;
  custom: boolean;
  groups: Group[];
  order: Record<Group, number>;
  weight: number | null;
}
export interface History {
  id: string;
  exerciseId: string;
  oldWeight: number | null;
  newWeight: number;
  at: number;
  startedAt: number;
  session: string;
}
export interface Settings {
  id: "preferences";
  step: number;
}
export interface Backup {
  app: "gym-weight-tracker";
  version: 1;
  exportedAt: string;
  exercises: Exercise[];
  history: History[];
  settings: Settings;
}
