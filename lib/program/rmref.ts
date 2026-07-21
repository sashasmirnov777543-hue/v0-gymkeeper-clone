import type { NumericRange } from "./types.ts";

export const DEFAULT_RMREF_KG = 115;
export const DEFAULT_WEIGHT_STEP_KG = 2.5;
export const RMREF_CHECKPOINTS = ["h2-9", "v9-4", "v9-8"] as const;
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

export function e1rmFromStandardTriple(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError("triple weight must be positive");
  }
  return Number((weightKg * 1.1).toFixed(4));
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
  if (delta < 0) reasons.push("automatic-decrease-not-permitted");
  if (delta > 2.5 + EPSILON) reasons.push("increase-exceeds-2.5-kg");
  if (delta > EPSILON && Math.abs(delta - 2.5) > EPSILON) {
    reasons.push("increase-must-use-2.5-kg-step");
  }

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
  if (delta > EPSILON && confirmations.length < 2) {
    reasons.push("two-comparable-confirmations-required");
  }

  return {
    allowed: reasons.length === 0,
    nextRmrefKg: reasons.length === 0 ? input.proposedRmrefKg : input.currentRmrefKg,
    reasons,
  };
}
