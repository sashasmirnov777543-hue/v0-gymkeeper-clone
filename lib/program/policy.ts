import { roundToStepHalfDown } from "./rmref.ts";
import type { ReadinessLevel } from "../readiness.ts";

/** Revision 3.0. A recorded restriction is not medical clearance issued by this app. */
export type SafetyProfile = Readonly<{
  reviewed: boolean;
  baseConfirmed: boolean;
  loadCeilingKg: number | null;
  weightStepKg: number;
  barWeightKg: number;
  notes: string;
  controlEffortAllowed: boolean;
  singlesAllowed: boolean;
  directOneRmAllowed: boolean;
  testBranch: "triple" | "direct_1rm";
  selectedBeforeCycle17: boolean;
  confirmedAtCycle20: boolean;
  supportMode: number;
  optionalLegs: boolean;
}>;
export const DEFAULT_SAFETY_PROFILE: SafetyProfile = {
  reviewed: false,
  baseConfirmed: false,
  loadCeilingKg: null,
  weightStepKg: 2.5,
  barWeightKg: 20,
  notes: "",
  controlEffortAllowed: false,
  singlesAllowed: false,
  directOneRmAllowed: false,
  testBranch: "triple",
  selectedBeforeCycle17: false,
  confirmedAtCycle20: false,
  supportMode: 0,
  optionalLegs: false,
};
export function safetyProfile(value: unknown): SafetyProfile {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const positive = (x: unknown, max: number) =>
    typeof x === "number" && Number.isFinite(x) && x > 0 && x <= max;
  const invalidCap = v.loadCeilingKg != null && !positive(v.loadCeilingKg, 500);
  return {
    reviewed: v.reviewed === true && !invalidCap,
    baseConfirmed: v.baseConfirmed === true,
    loadCeilingKg: positive(v.loadCeilingKg, 500)
      ? Number(v.loadCeilingKg)
      : null,
    weightStepKg: [0.5, 1, 1.25, 2.5, 5].includes(Number(v.weightStepKg))
      ? Number(v.weightStepKg)
      : 2.5,
    barWeightKg: positive(v.barWeightKg, 30) ? Number(v.barWeightKg) : 20,
    notes: typeof v.notes === "string" ? v.notes.slice(0, 2000) : "",
    controlEffortAllowed: v.controlEffortAllowed === true,
    singlesAllowed: v.singlesAllowed === true,
    directOneRmAllowed: v.directOneRmAllowed === true,
    testBranch: v.testBranch === "direct_1rm" ? "direct_1rm" : "triple",
    selectedBeforeCycle17: v.selectedBeforeCycle17 === true,
    confirmedAtCycle20: v.confirmedAtCycle20 === true,
    supportMode:
      Number.isInteger(v.supportMode) &&
      Number(v.supportMode) >= 0 &&
      Number(v.supportMode) <= 6
        ? Number(v.supportMode)
        : 0,
    optionalLegs: v.optionalLegs === true,
  };
}
export function floorToStep(value: number, step = 2.5): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(step) ||
    step <= 0
  )
    throw new RangeError("Invalid weight/step");
  return Number((Math.floor((value + 1e-9) / step) * step).toFixed(4));
}
export function applyCeiling(weight: number, profile: SafetyProfile): number {
  const rounded = roundToStepHalfDown(weight, profile.weightStepKg);
  return profile.loadCeilingKg === null
    ? rounded
    : Math.min(
        rounded,
        floorToStep(profile.loadCeilingKg, profile.weightStepKg),
      );
}
/** W0 = nearest(W115 * R / 115), then a separate downward-rounded, fixed C. */
export function startingWeight(
  exampleKg: number,
  baseKg: number,
  profile: SafetyProfile,
): number {
  if (
    !Number.isFinite(exampleKg) ||
    exampleKg <= 0 ||
    !Number.isFinite(baseKg) ||
    baseKg <= 0
  )
    throw new RangeError("Invalid starting example/base");
  return applyCeiling((exampleKg * baseKg) / 115, profile);
}
export function ceilingFromPercent(
  referenceKg: number,
  percent: number,
  step = 2.5,
): number {
  if (
    !Number.isFinite(referenceKg) ||
    referenceKg <= 0 ||
    !Number.isFinite(percent) ||
    percent <= 0 ||
    percent > 100
  )
    throw new RangeError("Invalid ceiling");
  return floorToStep((referenceKg * percent) / 100, step);
}
export type WarmupSet = Readonly<{ weightKg: number; reps: number }>;
export function buildWarmup(
  workWeight: number | null,
  profile: SafetyProfile,
  kind: "normal" | "light" | "control" = "normal",
  heavy = false,
): WarmupSet[] {
  if (
    workWeight === null ||
    !Number.isFinite(workWeight) ||
    workWeight <= profile.barWeightKg ||
    (profile.loadCeilingKg !== null &&
      profile.barWeightKg > profile.loadCeilingKg)
  )
    return [];
  const limit = Math.min(workWeight, profile.loadCeilingKg ?? workWeight);
  const fractions: Array<[number, number]> =
    kind === "control"
      ? [
          [0.4, 5],
          [0.6, 3],
          [0.75, 2],
          [0.85, 1],
          [0.925, 1],
        ]
      : kind === "light"
        ? [
            [0.5, 5],
            [0.7, 3],
          ]
        : [
            [0.5, 5],
            [0.7, 3],
            [0.85, 1],
            ...(heavy ? [[0.925, 1] as [number, number]] : []),
          ];
  const result: WarmupSet[] = [{ weightKg: profile.barWeightKg, reps: 10 }];
  for (const [fraction, reps] of fractions) {
    const kg = floorToStep(
      Math.min(limit, workWeight * fraction),
      profile.weightStepKg,
    );
    if (kg > result[result.length - 1].weightKg && kg < workWeight)
      result.push({ weightKg: kg, reps });
  }
  return result;
}
export function formatWarmup(sets: readonly WarmupSet[]): string {
  return sets
    .map((s) => `${String(s.weightKg).replace(".", ",")}×${s.reps}`)
    .join(" → ");
}
export function cardioPlan(
  planned: number,
  readiness: string,
  coach: Record<string, unknown> = {},
) {
  const original = Number.isFinite(planned) ? Math.max(0, planned) : 0;
  let minutes =
    readiness === "red" || readiness === "orange"
      ? 0
      : readiness === "yellow"
        ? Math.min(original, 15)
        : original;
  if (coach.skip === true) minutes = 0;
  if (typeof coach.minutes === "number" && Number.isFinite(coach.minutes))
    minutes = Math.min(minutes, Math.max(0, coach.minutes));
  return {
    minutes,
    light: readiness !== "green" || coach.replaceWithWalk === true,
    blocked: minutes === 0,
    note:
      readiness === "red"
        ? "Красный: никаких тренировочных замен."
        : readiness === "orange"
          ? "Оранжевый: отдых; короткая привычная прогулка только если безопасно."
          : original === 0
            ? "Полный тренировочный отдых. Нулевой план остаётся нулевым."
            : readiness === "yellow"
              ? "Жёлтый: очень легко, не более меньшего из плана и 15 минут."
              : "Общее время включает разминку и заминку. Не догонять пропущенное.",
  };
}
export type StartGuardInput = {
  profile: SafetyProfile;
  readiness: ReadinessLevel;
  kind: string;
  isRestDay: boolean;
  isControl: boolean;
  directBranch: boolean;
  finalTest: boolean;
  cycle: number;
  spotterPresent: boolean;
  safetiesSet: boolean;
  directHistoryVerified?: boolean;
  sideVideoReady?: boolean;
  technicalIssue?: boolean;
};
export function sessionStartReasons(i: StartGuardInput): string[] {
  const reasons: string[] = [];
  if (i.readiness === "red")
    reasons.push("Красный статус: тренировка и разминка отменяются.");
  if (i.isRestDay) reasons.push("В этот день полный тренировочный отдых.");
  if (i.kind === "cardio") {
    if (i.readiness === "orange")
      reasons.push(
        "Оранжевый: кардио заменяется отдыхом, не новой тренировкой.",
      );
    return reasons;
  }
  if (!i.profile.reviewed)
    reasons.push(
      "Сначала уточните и запишите индивидуальные ограничения в настройках.",
    );
  if (!i.profile.baseConfirmed && !i.isControl && i.readiness !== "orange")
    reasons.push(
      "115 кг — пример. Сначала установите консервативную рабочую базу R в настройках.",
    );
  if (!i.spotterPresent && !i.safetiesSet)
    reasons.push("Для штанги нужны упоры или компетентный страхующий.");
  if (
    i.isControl &&
    i.readiness === "green" &&
    (!i.spotterPresent || !i.safetiesSet)
  )
    reasons.push("Для КТ нужны и упоры, и помощь страхующего.");
  if (i.finalTest && i.readiness !== "green")
    reasons.push(
      "Итоговый тест только на зелёном; перенос по восстановлению, без обязательного срока.",
    );
  if (i.finalTest && i.technicalIssue)
    reasons.push(
      "При тяжёлой разминке или технической проблеме тест отложить либо завершить блок без теста.",
    );
  if (i.directBranch) {
    if (
      i.readiness !== "green" ||
      !i.profile.singlesAllowed ||
      !i.profile.directOneRmAllowed ||
      !i.profile.selectedBeforeCycle17 ||
      i.profile.testBranch !== "direct_1rm"
    )
      reasons.push("Отдельная ветка 1ПМ не подготовлена или не согласована.");
    if (i.cycle >= 20 && !i.profile.confirmedAtCycle20)
      reasons.push("Ветка 1ПМ требует отдельного подтверждения на КТ4.");
    if (i.finalTest && !i.directHistoryVerified)
      reasons.push(
        "Нет подтверждённых чистых подготовительных синглов Ц17, Ц19 и Ц21.",
      );
    if (i.finalTest && !i.sideVideoReady)
      reasons.push("Для сопоставимого контроля подготовьте видео сбоку.");
  }
  return reasons;
}
export type EffortSet = Readonly<{
  workoutExerciseId: number;
  role?: string;
  rpe?: number | null;
  rir?: number | null;
  weight?: number | null;
  reps?: number | null;
  isWarmup?: boolean;
  techniqueSigns?: unknown;
  symptoms?: unknown;
  pauseQuality?: string | null;
  touchPoint?: string | null;
  trajectoryQuality?: string | null;
}>;
export function symptomsOrUnsafe(set: EffortSet): boolean {
  return Array.isArray(set.symptoms) && set.symptoms.length > 0;
}
export function techniqueClean(set: EffortSet): boolean {
  return (
    !symptomsOrUnsafe(set) &&
    (!Array.isArray(set.techniqueSigns) || set.techniqueSigns.length === 0) &&
    (set.pauseQuality == null || set.pauseQuality === "clean") &&
    (set.touchPoint == null || set.touchPoint === "stable") &&
    (set.trajectoryQuality == null || set.trajectoryQuality === "clean")
  );
}
export function isPressRole(role: string) {
  return /bench|backoff|calibration|test_triple|single|direct_1rm|chest_accessory|triceps_accessory/.test(
    role,
  );
}
export function isPrimaryRole(role: string) {
  return /bench|backoff|calibration|test_triple|single|direct_1rm/.test(role);
}
/** Aggregate across exercises: lowering the bar or changing rows does not reset fatigue. */
export function sessionStopState(
  sets: readonly EffortSet[],
  profile: SafetyProfile,
) {
  let stopAll = false;
  let stopPress = false;
  let ordinaryMainStopped = false;
  let cleanControl = false;
  let reasons: string[] = [];
  for (const s of sets) {
    const role = s.role ?? "";
    if (symptomsOrUnsafe(s)) {
      stopAll = true;
      reasons.push("Симптом или опасная потеря контроля: нагрузку прекратить.");
    }
    if (
      s.weight != null &&
      profile.loadCeilingKg != null &&
      isPrimaryRole(role) &&
      s.weight > floorToStep(profile.loadCeilingKg, profile.weightStepKg) + 1e-9
    ) {
      stopAll = true;
      reasons.push(
        "Фактический вес превысил записанный личный предел. Новые подходы запрещены.",
      );
    }
    if (!isPrimaryRole(role)) continue;
    const grinder =
      Array.isArray(s.techniqueSigns) && s.techniqueSigns.includes("grinder");
    if (
      grinder ||
      s.reps === 0 ||
      (s.rpe != null && s.rpe > 8 && role !== "direct_1rm")
    ) {
      stopPress = true;
      reasons.push(
        "Гриндер, отказ или нештатно тяжёлый подход: жимовую работу прекратить.",
      );
    }
    if (Array.isArray(s.techniqueSigns) && s.techniqueSigns.length >= 2) {
      stopPress = true;
      reasons.push(
        "Несколько технических нарушений: жимовую работу прекратить.",
      );
    }
    if (s.isWarmup) {
      if (s.rpe != null && s.rpe >= 8) {
        stopPress = true;
        reasons.push(
          "Неожиданно тяжёлая разминка: не переходить к тяжёлой работе.",
        );
      }
      continue;
    }
    if (/calibration|test_triple/.test(role)) {
      cleanControl =
        s.reps === 3 &&
        s.rpe != null &&
        s.rpe <= 8 &&
        techniqueClean(s) &&
        s.pauseQuality === "clean" &&
        s.touchPoint === "stable" &&
        s.trajectoryQuality === "clean";
      if (!cleanControl) ordinaryMainStopped = true;
    } else if (role !== "direct_1rm" && s.rpe != null && s.rpe >= 8)
      ordinaryMainStopped = true;
    if (role === "direct_1rm" && (grinder || (s.rpe != null && s.rpe >= 9.5)))
      stopPress = true;
  }
  const signs = sets.filter(
    (s) =>
      isPrimaryRole(s.role ?? "") &&
      Array.isArray(s.techniqueSigns) &&
      s.techniqueSigns.length > 0,
  );
  if (signs.length >= 2) {
    stopPress = true;
    reasons.push(
      "Повтор технического нарушения: основной и вторичный жим остановить.",
    );
  }
  return {
    stopAll,
    stopPress,
    ordinaryMainStopped,
    cleanControl,
    reasons: [...new Set(reasons)],
  };
}
export function nextSetAdvice(input: {
  sets: readonly EffortSet[];
  exerciseId: number;
  role: string;
  targetSets: number;
  targetRpeMax: number | null;
  plannedKg: number | null;
  profile: SafetyProfile;
  readiness: string;
  progressionEligible: boolean;
  afterControlLight?: boolean;
}) {
  const state = sessionStopState(input.sets, input.profile);
  const own = input.sets.filter(
    (s) => s.workoutExerciseId === input.exerciseId && !s.isWarmup,
  );
  const last = own.at(-1);
  const press = isPressRole(input.role);
  const primary = isPrimaryRole(input.role);
  let blocked =
    state.stopAll ||
    (press && state.stopPress) ||
    (primary && state.ordinaryMainStopped);
  if (primary && input.afterControlLight && !state.cleanControl) blocked = true;
  if (own.length >= input.targetSets) blocked = true;
  let weight = last?.weight ?? input.plannedKg;
  let reason = "Сохранить вес; план — кандидат, не обязательство.";
  if (blocked)
    reason =
      "Дальнейшие подходы этой строки не предусмотрены или остановлены правилом безопасности.";
  else if (
    primary &&
    last &&
    Array.isArray(last.techniqueSigns) &&
    last.techniqueSigns.length > 0
  ) {
    if (weight != null)
      weight = applyCeiling(Math.max(0, weight - 2.5), input.profile);
    reason =
      "Технический признак: снизить вес на 2,5–5 кг и/или убрать сет. При повторе прекратить жим.";
  } else if (
    primary &&
    last?.rpe != null &&
    (last.rpe >= 7.5 ||
      (input.targetRpeMax != null && last.rpe >= input.targetRpeMax))
  ) {
    if (weight != null)
      weight = applyCeiling(Math.max(0, weight - 2.5), input.profile);
    reason =
      "До последнего сета достигнут предел усилия: снизить на 2,5–5 кг или убрать оставшийся сет.";
  } else if (
    primary &&
    own.length === 1 &&
    !input.sets.some(
      (s) =>
        s.workoutExerciseId !== input.exerciseId &&
        !s.isWarmup &&
        isPressRole(s.role ?? ""),
    ) &&
    !input.sets.some((s) => s.isWarmup && s.rpe != null && s.rpe >= 7) &&
    last?.rpe != null &&
    last.rpe <= 5.5 &&
    input.progressionEligible &&
    input.readiness === "green" &&
    techniqueClean(last) &&
    last.pauseQuality === "clean" &&
    last.touchPoint === "stable" &&
    last.trajectoryQuality === "clean" &&
    weight != null &&
    input.plannedKg != null &&
    weight <= input.plannedKg
  ) {
    weight = applyCeiling(weight + 2.5, input.profile);
    reason =
      "Первый сет явно лёгкий: допустим один шаг +2,5 кг, не обязанность. В следующих сетах не повышать.";
  }
  if (input.role === "direct_1rm" && !blocked) {
    weight = null;
    reason =
      "Вес следующей попытки — по заранее согласованному плану, не автоматическая прибавка. Обычный шаг 2,5 кг; завершить раньше максимума допустимо.";
  }
  if (primary && weight != null) weight = applyCeiling(weight, input.profile);
  return { blocked, weight, reason, state };
}
/** The legacy 0.863 expression is an optional index only for a clean comparable ~3@8. */
export function comparableTripleIndex(
  weight: number,
  reps: number,
  rpe: number | null,
  comparable: boolean,
): number | null {
  if (
    !comparable ||
    reps !== 3 ||
    rpe == null ||
    !Number.isFinite(rpe) ||
    Math.abs(rpe - 8) > 0.25 ||
    !Number.isFinite(weight) ||
    weight <= 0
  )
    return null;
  return weight / 0.863;
}

/** A changed profile may tighten an ongoing session, never silently expand its ceiling. */
export function effectiveSafetyProfile(
  saved: SafetyProfile,
  current: SafetyProfile,
): SafetyProfile {
  const cap =
    saved.loadCeilingKg == null
      ? current.loadCeilingKg
      : current.loadCeilingKg == null
        ? saved.loadCeilingKg
        : Math.min(saved.loadCeilingKg, current.loadCeilingKg);
  return {
    ...saved,
    loadCeilingKg: cap,
    reviewed: saved.reviewed && current.reviewed,
    controlEffortAllowed:
      saved.controlEffortAllowed && current.controlEffortAllowed,
    singlesAllowed: saved.singlesAllowed && current.singlesAllowed,
    directOneRmAllowed: saved.directOneRmAllowed && current.directOneRmAllowed,
  };
}
