import type { NumericRange } from "./types.ts";

export const DEFAULT_RMREF_KG = 115;
export const DEFAULT_WEIGHT_STEP_KG = 2.5;
/**
 * Редакция 2.0: шесть точек измерения вместо трёх.
 * Ц1 (h2-1) — базовый замер, Ц5 (h2-5), Ц9 (h2-9), Ц14 (v9-5), Ц20 (v9-11), Ц22 (v9-13) — тест.
 */
export const RMREF_CHECKPOINTS = [
  "h2-1",
  "h2-5",
  "h2-9",
  "v9-5",
  "v9-11",
  "v9-13",
] as const;

/** Коэффициент пересчёта тройки @RPE 8 в 1ПМ по таблице RPE. */
export const STANDARD_TRIPLE_RPE8_FACTOR = 0.863;

/** Максимальное изменение RMref за одну контрольную точку, в любую сторону. */
export const RMREF_MAX_STEP_KG = 5;
export type RmrefCheckpoint = (typeof RMREF_CHECKPOINTS)[number];

const EPSILON = 1e-9;

/** Nearest step; an exact midpoint is rounded toward the lower weight. */
export function roundToStepHalfDown(
  value: number,
  step = DEFAULT_WEIGHT_STEP_KG,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    throw new TypeError("value and step must be finite; step must be positive");
  }
  const quotient = value / step;
  const lower = Math.floor(quotient);
  const fraction = quotient - lower;
  const roundedUnits = fraction > 0.5 + EPSILON ? lower + 1 : lower;
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  return Number((roundedUnits * step).toFixed(decimals));
}

export function weightFromRmrefPercent(
  rmrefKg: number,
  percent: number,
  step = DEFAULT_WEIGHT_STEP_KG,
): number {
  if (!Number.isFinite(rmrefKg) || rmrefKg <= 0) {
    throw new RangeError("RMref must be a positive finite number");
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("percent must be between 0 and 100");
  }
  return roundToStepHalfDown((rmrefKg * percent) / 100, step);
}

export function weightRangeFromRmref(
  rmrefKg: number,
  percent: NumericRange | null,
  step = DEFAULT_WEIGHT_STEP_KG,
): NumericRange | null {
  if (!percent) return null;
  return {
    min:
      percent.min === null
        ? null
        : weightFromRmrefPercent(rmrefKg, percent.min, step),
    max:
      percent.max === null
        ? null
        : weightFromRmrefPercent(rmrefKg, percent.max, step),
  };
}

/**
 * e1RM стандартизированной тройки @RPE 8.
 *
 * Редакция 2.0 отказалась от формулы Эпли (вес × 1,10): она выведена на подходах
 * до отказа и занижает результат тройки @RPE 8 примерно на 5%. Тройка @RPE 8 —
 * это около 86,3% от 1ПМ по таблице RPE, поэтому пересчёт идёт делением.
 */
export function e1rmFromStandardTriple(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError("triple weight must be positive");
  }
  return Number((weightKg / STANDARD_TRIPLE_RPE8_FACTOR).toFixed(4));
}

/**
 * RMref, выведенный из калибровочной тройки: вес ÷ 0,863, вниз до шага 2,5 кг.
 * Округление вниз намеренное — RMref не должен опережать подтверждённую способность.
 */
export function rmrefFromCalibrationTriple(
  tripleWeightKg: number,
  step: number = DEFAULT_WEIGHT_STEP_KG,
): number {
  const raw = e1rmFromStandardTriple(tripleWeightKg);
  return Number((Math.floor((raw + EPSILON) / step) * step).toFixed(4));
}

export type RmrefEvidence = Readonly<{
  sessionId: string | number;
  comparableTechnique: boolean;
  comparablePause: boolean;
  comparableTouchPoint: boolean;
  improvementConfirmed: boolean;
}>;

export type RmrefReviewInput = Readonly<{
  checkpoint: string;
  currentRmrefKg: number;
  proposedRmrefKg: number;
  evidence: readonly RmrefEvidence[];
}>;

export type RmrefReviewDecision = Readonly<{
  allowed: boolean;
  nextRmrefKg: number;
  reasons: readonly string[];
}>;

export function reviewRmrefUpdate(input: RmrefReviewInput): RmrefReviewDecision {
  const reasons: string[] = [];
  if (!RMREF_CHECKPOINTS.includes(input.checkpoint as RmrefCheckpoint)) {
    reasons.push("not-an-rmref-checkpoint");
  }
  if (!Number.isFinite(input.currentRmrefKg) || input.currentRmrefKg <= 0) {
    reasons.push("invalid-current-rmref");
  }
  if (!Number.isFinite(input.proposedRmrefKg) || input.proposedRmrefKg <= 0) {
    reasons.push("invalid-proposed-rmref");
  }
  const delta = input.proposedRmrefKg - input.currentRmrefKg;
  // Редакция 2.0: снижение разрешено наравне с повышением. Коридор ±5 кг за точку.
  if (Math.abs(delta) > RMREF_MAX_STEP_KG + EPSILON) {
    reasons.push("change-exceeds-5-kg");
  }
  if (
    Math.abs(delta) > EPSILON &&
    Math.abs(delta - roundToStepHalfDown(delta)) > EPSILON
  ) {
    reasons.push("change-must-use-2.5-kg-step");
  }

  // Подтверждением служит сама стандартизированная тройка: она снята по единому
  // протоколу (одна пауза, точка касания, RPE 8, видео). Правило «двух сопоставимых
  // подтверждений» редакции 1.0 было нужно, пока RMref угадывался.
  const distinctEvidence = new Map(
    input.evidence.map((item) => [String(item.sessionId), item]),
  );
  const confirmations = [...distinctEvidence.values()].filter(
    (item) =>
      item.comparableTechnique &&
      item.comparablePause &&
      item.comparableTouchPoint &&
      item.improvementConfirmed,
  );
  if (Math.abs(delta) > EPSILON && confirmations.length < 1) {
    reasons.push("comparable-calibration-required");
  }

  return {
    allowed: reasons.length === 0,
    nextRmrefKg: reasons.length === 0 ? input.proposedRmrefKg : input.currentRmrefKg,
    reasons,
  };
}
