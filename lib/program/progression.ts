import {
  applyCeiling,
  techniqueClean,
  type EffortSet,
  type SafetyProfile,
} from "./policy.ts";

export type CompletedExposure = Readonly<{
  sessionId: number;
  signature: string;
  baseKg: number;
  green: boolean;
  completed: boolean;
  plannedSets: number;
  plannedReps: string;
  sets: readonly EffortSet[];
}>;
function successful(e: CompletedExposure, maxRpe: number) {
  const reps = Number(e.plannedReps);
  const working = e.sets.filter((s) => !s.isWarmup);
  return (
    e.green &&
    e.completed &&
    working.length === e.plannedSets &&
    working.every(
      (s) =>
        s.weight != null &&
        s.weight > 0 &&
        s.reps === reps &&
        s.rpe != null &&
        s.rpe <= maxRpe &&
        techniqueClean(s) &&
        s.pauseQuality === "clean" &&
        s.touchPoint === "stable" &&
        s.trajectoryQuality === "clean",
    )
  );
}
/** Match exact exercise/sets/reps/base. No global delta and no stacking with a new schema. */
export function repeatedSchemeStart(input: {
  signature: string;
  baseKg: number;
  candidateKg: number;
  eligible: boolean;
  exposures: readonly CompletedExposure[];
  profile: SafetyProfile;
}) {
  const seen = new Set<number>();
  const matched = input.exposures.filter((e) => {
    if (
      seen.has(e.sessionId) ||
      e.signature !== input.signature ||
      e.baseKg !== input.baseKg
    )
      return false;
    seen.add(e.sessionId);
    return true;
  });
  const latest = matched[0];
  if (!input.eligible)
    return {
      weightKg: input.candidateKg,
      raised: false,
      reason: "В этой фазе повышения заморожены.",
    };
  if (!latest) {
    const currentSets = Number(input.signature.match(/\|(\d+)x/)?.[1]);
    const family = input.signature.replace(/\|\d+x/, "|Nx");
    const shorter = input.exposures.find(
      (e) =>
        e.baseKg === input.baseKg &&
        e.signature.replace(/\|\d+x/, "|Nx") === family &&
        e.plannedSets < currentSets &&
        successful(e, 8),
    );
    const held = shorter
      ? Math.min(
          input.candidateKg,
          ...shorter.sets
            .filter((s) => !s.isWarmup)
            .map((s) => s.weight as number),
        )
      : input.candidateKg;
    return {
      weightKg: applyCeiling(held, input.profile),
      raised: false,
      reason: shorter
        ? "При увеличении числа сетов сначала сохранить последний успешный вес."
        : "Новая схема или новая база: старт W0 и оценка первым сетом.",
    };
  }
  if (!successful(latest, 8)) {
    const actual = latest.sets
      .filter((s) => !s.isWarmup && s.weight != null)
      .map((s) => s.weight as number);
    const kg = actual.length
      ? Math.min(input.candidateKg, Math.min(...actual))
      : input.candidateKg;
    return {
      weightKg: applyCeiling(kg, input.profile),
      raised: false,
      reason:
        "Последняя сопоставимая сессия не подтверждает повышение; не догонять план.",
    };
  }
  const currentWeights = latest.sets
    .filter((s) => !s.isWarmup)
    .map((s) => s.weight as number);
  const lastWeight = Math.min(...currentWeights);
  const previous = matched[1];
  const sameWeight =
    previous &&
    previous.sets
      .filter((s) => !s.isWarmup)
      .every((s) => s.weight === lastWeight) &&
    currentWeights.every((w) => w === lastWeight);
  const raise = Boolean(
    previous && sameWeight && successful(latest, 7) && successful(previous, 7),
  );
  const weightKg = applyCeiling(lastWeight + (raise ? 2.5 : 0), input.profile);
  return {
    weightKg,
    raised: raise && weightKg > lastWeight,
    reason: raise
      ? "Два зелёных выполнения той же схемы с последним RPE ≤7: допустим +2,5 кг, с учётом C."
      : "Точное повторение схемы: последний успешно выполненный вес, без общей надбавки.",
  };
}
export type BaseEvidence = Readonly<{
  sessionId: number;
  kind: "control" | "ordinary";
  green: boolean;
  comparable: boolean;
  completed: boolean;
  progressConfirmed: boolean;
}>;
export function reviewTrainingBase(input: {
  current: number;
  proposed: number;
  programDay: number;
  evidence: readonly BaseEvidence[];
  baseConfirmed: boolean;
}) {
  const reasons: string[] = [];
  if (
    ![input.current, input.proposed].every(
      (v) => Number.isFinite(v) && v > 0 && v <= 500,
    )
  )
    reasons.push("Некорректная база R.");
  const up = input.proposed > input.current;
  if (up && input.programDay >= 156)
    reasons.push("После КТ4 базу для подводки вверх не менять.");
  if (up && Math.abs(input.proposed - input.current - 2.5) > 1e-9)
    reasons.push("Повышение рабочей базы — только один шаг 2,5 кг.");
  const distinct = [
    ...new Map(input.evidence.map((e) => [e.sessionId, e])).values(),
  ].filter(
    (e) =>
      Number.isInteger(e.sessionId) &&
      e.sessionId > 0 &&
      e.green &&
      e.comparable &&
      e.completed &&
      e.progressConfirmed,
  );
  if (
    up &&
    input.baseConfirmed &&
    (distinct.filter((e) => e.kind === "ordinary").length < 2 ||
      !distinct.some((e) => e.kind === "control"))
  )
    reasons.push(
      "Нужны согласованные данные контроля и двух различных обычных зелёных сессий.",
    );
  return {
    allowed: reasons.length === 0,
    nextBaseKg: reasons.length === 0 ? input.proposed : input.current,
    reasons,
  };
}
/** Accessory progression is earned at the rep-range ceiling twice, never from bar speed. */
export function accessoryProgression(input: {
  sets: readonly EffortSet[];
  previous: readonly EffortSet[];
  targetSets: number;
  repMax: number;
  rirMin: number;
  stepKg: number;
}) {
  const complete = (rows: readonly EffortSet[]) =>
    rows.length === input.targetSets &&
    rows.every(
      (s) =>
        !s.isWarmup &&
        s.weight != null &&
        s.reps != null &&
        s.reps >= input.repMax &&
        s.rir != null &&
        s.rir >= input.rirMin &&
        techniqueClean(s) &&
        s.trajectoryQuality === "clean",
    );
  const weight = input.sets[0]?.weight;
  const raise =
    weight != null &&
    complete(input.sets) &&
    complete(input.previous) &&
    [...input.sets, ...input.previous].every((s) => s.weight === weight);
  return {
    canIncrease: raise,
    weightKg: raise ? weight + input.stepKg : (weight ?? null),
  };
}
