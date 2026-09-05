import {
  applyCeiling,
  buildWarmup,
  floorToStep,
  formatWarmup,
  isPrimaryRole,
  startingWeight,
  type SafetyProfile,
} from "./policy.ts";

export type ExerciseInput = {
  id: number;
  name: string;
  weightText: string | null;
  targetSets: string | null;
  targetReps: string | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRpeMin?: string | number | null;
  targetRpeMax?: string | number | null;
  role?: string;
  isOptional?: boolean;
  conditionCode?: string | null;
  comment: string | null;
  restSeconds: number | null;
  tempo?: string | null;
  programKey?: string | null;
  exampleKgMin?: string | number | null;
  pctMin?: string | number | null;
  prescription?: unknown;
};
export type PreparedExercise = {
  id: number;
  name: string;
  weightText: string | null;
  targetSets: string | null;
  targetReps: string | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRpeMin: number | null;
  targetRpeMax: number | null;
  role: string;
  isOptional: boolean;
  condition: string | null;
  comment: string | null;
  restSeconds: number | null;
  tempo?: string | null;
  plannedKg: number | null;
  hardCeilingKg: number | null;
  warmupText: string | null;
  progressionEligible: boolean;
  afterControlLight: boolean;
  signature: string;
};
export type PlanContext = {
  baseKg: number;
  profile: SafetyProfile;
  readiness: string;
  branch?: string | null;
  isControl: boolean;
  isDeload: boolean;
  isTaper: boolean;
  warmupKind?: string | null;
  coachPatch?: Record<string, unknown>;
  returning?: boolean;
};
const number = (v: unknown) =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);
const count = (v: string | null) => Number(v?.match(/^\d+/)?.[0] ?? 1);
const meta = (e: ExerciseInput) =>
  e.prescription && typeof e.prescription === "object"
    ? (e.prescription as Record<string, unknown>)
    : {};

export function prepareExercises(
  rows: readonly ExerciseInput[],
  c: PlanContext,
): PreparedExercise[] {
  if (c.readiness === "red") return [];
  const patch = c.coachPatch ?? {};
  const skipped = new Set(
    Array.isArray(patch.skipOptionalExerciseIds)
      ? patch.skipOptionalExerciseIds.map(String)
      : [],
  );
  let selected = rows.filter((e) => {
    const m = meta(e);
    const role = e.role ?? "accessory";
    if (m.branchId === "direct_1rm")
      return c.branch === "direct_1rm" && c.readiness === "green";
    if (c.branch === "direct_1rm" && isPrimaryRole(role)) return false;
    if (
      skipped.has(String(e.id)) ||
      (e.programKey && skipped.has(e.programKey))
    )
      return false;
    if (role === "optional_legs")
      return (
        c.profile.optionalLegs &&
        !c.isDeload &&
        !c.isTaper &&
        c.readiness === "green"
      );
    if (role === "rehab")
      return (
        c.profile.supportMode > 0 &&
        c.profile.reviewed &&
        c.readiness === "green"
      );
    if (
      c.readiness !== "green" &&
      /calibration|test|single|direct_1rm/.test(role)
    )
      return false;
    if (
      patch.stopSecondaryPressing === true &&
      /chest_accessory|triceps_accessory|secondary/.test(role)
    )
      return false;
    return true;
  });
  if (c.readiness === "orange" || patch.techniqueOnly === true) {
    const primary = selected.find((e) => isPrimaryRole(e.role ?? ""));
    selected = primary ? [primary] : [];
  }
  return selected.map((e) => {
    const m = meta(e);
    const role = e.role ?? "accessory";
    const primary = isPrimaryRole(role);
    const control = /calibration|test_triple/.test(role);
    const technique = c.readiness === "orange" || patch.techniqueOnly === true;
    let sets = count(e.targetSets);
    let reps = e.targetReps;
    let rpeMin = number(e.targetRpeMin);
    let rpeMax = number(e.targetRpeMax);
    let rirMin = e.targetRirMin;
    let rirMax = e.targetRirMax;
    const example =
      number(e.exampleKgMin) ??
      number((m.exampleKg as { min?: number } | undefined)?.min);
    let weight =
      c.profile.baseConfirmed && example != null
        ? startingWeight(example, c.baseKg, c.profile)
        : null;
    let comment = e.comment ?? "";
    const reduction = Math.max(
      c.readiness === "yellow" ? 5 : 0,
      c.returning ? 10 : 0,
      patch.weightReductionPercent === 2.5 || patch.weightReductionPercent === 5
        ? Number(patch.weightReductionPercent)
        : 0,
    );
    if (primary && weight != null && reduction > 0)
      weight = applyCeiling(
        floorToStep(weight * (1 - reduction / 100), c.profile.weightStepKg),
        c.profile,
      );
    if (c.readiness === "yellow") {
      sets = primary ? Math.max(1, sets - 1) : Math.ceil(sets / 2);
      comment =
        "Жёлтый: начальный вес −5%, −1 рабочий сет, подсобка примерно вдвое. Без прибавок.\n" +
        comment;
    }
    if (patch.removeWorkingSets === 1 && c.readiness !== "yellow" && primary)
      sets = Math.max(1, sets - 1);
    if (c.returning) {
      sets = Math.max(1, Math.ceil(sets / 2));
      comment =
        "Возврат после паузы ≥7 дней: вводная сессия, меньше сетов и вес −10%; причина паузы и симптомы важнее календаря.\n" +
        comment;
    }
    if (technique) {
      sets = 2;
      reps = "3";
      rpeMin = null;
      rpeMax = 6;
      rirMin = 4;
      rirMax = null;
      weight = c.profile.baseConfirmed
        ? applyCeiling(
            floorToStep(c.baseKg * 0.5, c.profile.weightStepKg),
            c.profile,
          )
        : null;
      comment =
        "Вместо плана: 2×3 примерно на 50–60% R, легко, без подсобки. При дискомфорте отменить.\n";
    }
    if (
      control &&
      (!c.profile.baseConfirmed ||
        !c.profile.controlEffortAllowed ||
        c.returning)
    ) {
      rpeMin = 6;
      rpeMax = 7;
      weight = null;
      comment =
        "Ознакомительная/ограниченная тройка на знакомом согласованном весе, RPE 6–7. Это не 3@8 и не оценка 1ПМ.\n" +
        comment;
    }
    if (role === "rehab" && !c.isDeload && !c.isTaper) {
      const mode = c.profile.supportMode;
      if (mode === 2 && /bird_dog|dead_bug/.test(String(m.key))) sets = 2;
      if (mode === 3) {
        sets = 2;
        reps = /glute/.test(String(m.key))
          ? "10"
          : /plank/.test(String(m.key))
            ? "15–20 с на сторону"
            : /bird|dead/.test(String(m.key))
              ? "6 на сторону"
              : "10–12";
      }
      if (mode >= 4)
        comment =
          "Индивидуальный режим: напечатана только исходная доза; согласованная замена/сопротивление не добавляются поверх неё. Не прогрессировать автоматически.\n" +
          comment;
    }
    if (primary && weight != null && weight < c.profile.barWeightKg) {
      weight = null;
      comment =
        "Предел ниже массы выбранного грифа: нужен подходящий лёгкий гриф или согласованная замена; не загружать стандартный.\n" +
        comment;
    }
    const kind = control
      ? "control"
      : technique || c.warmupKind === "light"
        ? "light"
        : "normal";
    const warmup =
      primary && weight != null
        ? formatWarmup(
            buildWarmup(weight, c.profile, kind, weight / c.baseKg >= 0.78),
          )
        : null;
    const weightText = primary
      ? weight != null
        ? `${String(weight).replace(".", ",")} кг · старт, не обязательный вес`
        : control
          ? "Знакомый вес по разминке; без автоматической подстановки"
          : "Сначала подтвердите рабочую базу и подходящий гриф"
      : e.weightText;
    return {
      id: e.id,
      name: e.name,
      weightText,
      targetSets: String(sets),
      targetReps: reps,
      targetRirMin: rirMin,
      targetRirMax: rirMax,
      targetRpeMin: rpeMin,
      targetRpeMax: rpeMax,
      role,
      isOptional: e.isOptional ?? false,
      condition: e.conditionCode ?? null,
      comment,
      restSeconds: technique ? 180 : e.restSeconds,
      tempo: e.tempo,
      plannedKg: weight,
      hardCeilingKg:
        primary && c.profile.loadCeilingKg != null
          ? floorToStep(c.profile.loadCeilingKg, c.profile.weightStepKg)
          : null,
      warmupText: warmup,
      progressionEligible:
        m.progressionEligible === true &&
        c.readiness === "green" &&
        !c.returning &&
        reduction === 0,
      afterControlLight:
        m.afterControlLight === true && c.readiness === "green",
      signature: `${m.key ?? e.name}|${sets}x${reps}${primary ? `|RPE=${rpeMax}|R=${c.baseKg}` : `|RIR=${rirMin}-${rirMax}`}`,
    };
  });
}
