export type TechnicalSign =
  | "pause_or_touch_lost"
  | "asymmetry"
  | "unexpected_slowdown"
  | "hips_lifted"
  | "grinder";

export type TechnicalStopInput = Readonly<{
  medicalSymptom: boolean;
  painChangesMovement: boolean;
  unsafeLossOfControl: boolean;
  signs: readonly TechnicalSign[];
  rpeAboveTargetByOne: boolean;
  repeatedAfterReduction: boolean;
}>;

export type TechnicalStopDecision = Readonly<{
  action: "continue" | "reduce" | "stop_primary" | "stop_all";
  weightReductionPercent: readonly [2.5, 5] | null;
  removeWorkingSets: 0 | 1;
  stopSecondaryPressing: boolean;
  reasons: readonly string[];
}>;

export function decideTechnicalStop(
  input: TechnicalStopInput,
): TechnicalStopDecision {
  const immediate: string[] = [];
  if (input.medicalSymptom) immediate.push("medical-symptom");
  if (input.painChangesMovement) immediate.push("pain-changes-movement");
  if (input.unsafeLossOfControl) immediate.push("unsafe-loss-of-control");
  if (immediate.length > 0) {
    return {
      action: "stop_all",
      weightReductionPercent: null,
      removeWorkingSets: 0,
      stopSecondaryPressing: true,
      reasons: immediate,
    };
  }

  const uniqueSigns = [...new Set(input.signs)];
  if (uniqueSigns.length >= 2 || input.repeatedAfterReduction) {
    return {
      action: "stop_primary",
      weightReductionPercent: null,
      removeWorkingSets: 0,
      stopSecondaryPressing: true,
      reasons: [
        ...uniqueSigns,
        ...(input.repeatedAfterReduction ? ["repeated-after-reduction"] : []),
      ],
    };
  }
  if (uniqueSigns.length === 1 || input.rpeAboveTargetByOne) {
    return {
      action: "reduce",
      weightReductionPercent: [2.5, 5],
      removeWorkingSets: 1,
      stopSecondaryPressing: false,
      reasons: [
        ...uniqueSigns,
        ...(input.rpeAboveTargetByOne ? ["rpe-above-target-by-one"] : []),
      ],
    };
  }
  return {
    action: "continue",
    weightReductionPercent: null,
    removeWorkingSets: 0,
    stopSecondaryPressing: false,
    reasons: [],
  };
}
