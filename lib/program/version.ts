/**
 * Единая точка правды по версии программы.
 * Раньше строка "h2-v9-1.0" была продублирована в семи файлах и в ключе localStorage.
 */
export const ACTIVE_PROGRAM_VERSION = "h2-v9-3.0" as const;
export const PREVIOUS_PROGRAM_VERSION = "h2-v9-2.0" as const;
export type ActiveProgramVersion = typeof ACTIVE_PROGRAM_VERSION;

/** Уровни медицинского допуска. Определяют потолок интенсивности. */
export const CLEARANCE_LEVELS = ["level_1", "level_2", "level_3"] as const;
export type ClearanceLevel = (typeof CLEARANCE_LEVELS)[number];

export const CLEARANCE_LEVEL_CEILING_PERCENT: Readonly<Record<ClearanceLevel, number>> = {
  level_1: 85,
  level_2: 92.5,
  level_3: 100,
};

export const CLEARANCE_LEVEL_LABEL: Readonly<Record<ClearanceLevel, string>> = {
  level_1: "Уровень 1 — консервативный, потолок 85%",
  level_2: "Уровень 2 — стандартный, потолок 92,5%",
  level_3: "Уровень 3 — полный, потолок 100%",
};

export const DEFAULT_CLEARANCE_LEVEL: ClearanceLevel = "level_1";

/** Синглы разрешены с уровня 2. Прямой 1ПМ — только с уровня 3. */
export function clearanceAllowsSingles(level: ClearanceLevel): boolean {
  return level === "level_2" || level === "level_3";
}
export function clearanceAllowsDirectOneRm(level: ClearanceLevel): boolean {
  return level === "level_3";
}
export function isClearanceLevel(value: unknown): value is ClearanceLevel {
  return typeof value === "string" && (CLEARANCE_LEVELS as readonly string[]).includes(value);
}
