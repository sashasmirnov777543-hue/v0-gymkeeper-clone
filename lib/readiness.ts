export type ReadinessLevel = "green" | "yellow" | "orange" | "red";

export const CLINICAL_STOP_FLAGS = [
  "vision_symptoms",
  "chest_pressure",
  "unwell_palpitations",
  "disproportionate_dyspnea",
  "presyncope_or_syncope",
  "severe_dizziness_confusion_or_ataxia",
  "new_or_progressive_neurologic_or_cauda_equina_signs",
  "significant_medication_sedation_confusion_or_hyperthermia",
  "pain_changes_movement",
  "unsafe_loss_of_control",
] as const;

export type ClinicalStopFlag = (typeof CLINICAL_STOP_FLAGS)[number];
export type ClinicalStopFlags = Readonly<
  Partial<Record<ClinicalStopFlag, boolean>>
>;

export type RestingHeartRateTrend = Readonly<{
  /** Difference from the person's own baseline on comparable mornings. */
  deltaFromBaselineBpm?: number;
  comparableMornings?: number;
  poorWellbeing?: boolean;
}>;

export type ReadinessInput = Readonly<{
  clinicalStopFlags?: ClinicalStopFlags;
  poorSleep?: boolean;
  unusualShiftFatigue?: boolean;
  restingHeartRateTrend?: RestingHeartRateTrend;
  mildSoreness?: boolean;
  heavyButSafeWarmup?: boolean;
  clearlyExcessiveWarmupOrFirstSetRpe?: boolean;
  /** Optional raw observations stored with the session for the journal. */
  sleepMinutes?: number;
  sleepQuality?: number;
  shoulderPain?: number;
  backPain?: number;
  energy?: number;
}>;

export type ClinicalStopReasonCode = `red:${ClinicalStopFlag}`;
export type YellowReasonCode =
  | "yellow:poor_sleep"
  | "yellow:unusual_shift_fatigue"
  | "yellow:rhr_about_plus_5_two_mornings_with_poor_wellbeing"
  | "yellow:mild_soreness"
  | "yellow:heavy_but_safe_warmup";
export type OrangeReasonCode =
  | "orange:multiple_yellow_factors"
  | "orange:clearly_excessive_warmup_or_first_set_rpe";
export type GreenReasonCode = "green:no_adverse_signals";
export type ReadinessReasonCode =
  | ClinicalStopReasonCode
  | YellowReasonCode
  | OrangeReasonCode
  | GreenReasonCode;

export type GreenReadinessAction = Readonly<{
  summary: "Full plan.";
  training: Readonly<{
    mode: "full_plan";
    warmup: "as_planned";
    singles: "as_planned";
    tests: "as_planned";
    intensityTechniques: "as_planned";
  }>;
  cardio: Readonly<{ mode: "as_planned" }>;
  medicalBranch: Readonly<{ required: false }>;
}>;

export type YellowReadinessAction = Readonly<{
  summary: "No singles, tests, or intensity techniques; reduce one set or reduce weight by 2.5-5%. Cardio: 15-20 minutes Z1, walk, or skip.";
  training: Readonly<{
    mode: "reduced_plan";
    warmup: "as_planned";
    singles: "not_permitted";
    tests: "not_permitted";
    intensityTechniques: "not_permitted";
    adjustment: Readonly<{
      choice: "reduce_one_set_or_weight";
      setsToRemove: 1;
      weightReductionPercent: readonly [2.5, 5];
    }>;
  }>;
  cardio: Readonly<{
    mode: "recovery_options";
    minutes: readonly [15, 20];
    intensity: "Z1";
    options: readonly ["z1", "walk", "skip"];
  }>;
  medicalBranch: Readonly<{ required: false }>;
}>;

export type OrangeReadinessAction = Readonly<{
  summary: "Technique only: 50-65% RMref for 2-3 x 3; reduce accessory volume by 50% or skip it; no singles or tests. If symptom-free, cardio: 10-20 minutes Z1, walk, or rest.";
  training: Readonly<{
    mode: "technique_only";
    warmup: "for_technique_work_only";
    loadPercentRmref: readonly [50, 65];
    sets: readonly [2, 3];
    repsPerSet: 3;
    singles: "not_permitted";
    tests: "not_permitted";
    intensityTechniques: "not_permitted";
    accessories: Readonly<{
      volumeReductionPercent: 50;
      maySkip: true;
    }>;
  }>;
  cardio: Readonly<{
    mode: "recovery_options";
    symptomFreeOnly: true;
    minutes: readonly [10, 20];
    intensity: "Z1";
    options: readonly ["z1", "walk", "rest"];
  }>;
  medicalBranch: Readonly<{ required: false }>;
}>;

export type RedReadinessAction = Readonly<{
  summary: "No training or warm-up; follow the applicable medical branch.";
  training: Readonly<{
    mode: "none";
    warmup: "not_permitted";
    singles: "not_permitted";
    tests: "not_permitted";
    intensityTechniques: "not_permitted";
  }>;
  cardio: Readonly<{ mode: "none" }>;
  medicalBranch: Readonly<{
    required: true;
    instruction: "follow_applicable_medical_branch";
  }>;
}>;

export type ReadinessAction =
  | GreenReadinessAction
  | YellowReadinessAction
  | OrangeReadinessAction
  | RedReadinessAction;

export const READINESS_ACTIONS = {
  green: {
    summary: "Full plan.",
    training: {
      mode: "full_plan",
      warmup: "as_planned",
      singles: "as_planned",
      tests: "as_planned",
      intensityTechniques: "as_planned",
    },
    cardio: { mode: "as_planned" },
    medicalBranch: { required: false },
  },
  yellow: {
    summary:
      "No singles, tests, or intensity techniques; reduce one set or reduce weight by 2.5-5%. Cardio: 15-20 minutes Z1, walk, or skip.",
    training: {
      mode: "reduced_plan",
      warmup: "as_planned",
      singles: "not_permitted",
      tests: "not_permitted",
      intensityTechniques: "not_permitted",
      adjustment: {
        choice: "reduce_one_set_or_weight",
        setsToRemove: 1,
        weightReductionPercent: [2.5, 5],
      },
    },
    cardio: {
      mode: "recovery_options",
      minutes: [15, 20],
      intensity: "Z1",
      options: ["z1", "walk", "skip"],
    },
    medicalBranch: { required: false },
  },
  orange: {
    summary:
      "Technique only: 50-65% RMref for 2-3 x 3; reduce accessory volume by 50% or skip it; no singles or tests. If symptom-free, cardio: 10-20 minutes Z1, walk, or rest.",
    training: {
      mode: "technique_only",
      warmup: "for_technique_work_only",
      loadPercentRmref: [50, 65],
      sets: [2, 3],
      repsPerSet: 3,
      singles: "not_permitted",
      tests: "not_permitted",
      intensityTechniques: "not_permitted",
      accessories: {
        volumeReductionPercent: 50,
        maySkip: true,
      },
    },
    cardio: {
      mode: "recovery_options",
      symptomFreeOnly: true,
      minutes: [10, 20],
      intensity: "Z1",
      options: ["z1", "walk", "rest"],
    },
    medicalBranch: { required: false },
  },
  red: {
    summary: "No training or warm-up; follow the applicable medical branch.",
    training: {
      mode: "none",
      warmup: "not_permitted",
      singles: "not_permitted",
      tests: "not_permitted",
      intensityTechniques: "not_permitted",
    },
    cardio: { mode: "none" },
    medicalBranch: {
      required: true,
      instruction: "follow_applicable_medical_branch",
    },
  },
} as const satisfies Record<ReadinessLevel, ReadinessAction>;

export const READINESS_NOTICE =
  "This model selects a permitted training action; it does not make a medical diagnosis." as const;

export type ReadinessResult = Readonly<{
  level: ReadinessLevel;
  reasonCodes: readonly ReadinessReasonCode[];
  yellowFactorCount: number;
  permittedAction: ReadinessAction;
  notice: typeof READINESS_NOTICE;
}>;

function clinicalStopReasons(input: ReadinessInput): ClinicalStopReasonCode[] {
  return CLINICAL_STOP_FLAGS.filter(
    (flag) => input.clinicalStopFlags?.[flag] === true,
  ).map((flag): ClinicalStopReasonCode => `red:${flag}`);
}

function yellowFactorReasons(input: ReadinessInput): YellowReasonCode[] {
  const reasons: YellowReasonCode[] = [];

  if (
    input.poorSleep === true ||
    (Number.isFinite(input.sleepMinutes) && (input.sleepMinutes as number) < 360) ||
    (Number.isFinite(input.sleepQuality) && (input.sleepQuality as number) <= 2)
  ) {
    reasons.push("yellow:poor_sleep");
  }
  if (input.unusualShiftFatigue === true) {
    reasons.push("yellow:unusual_shift_fatigue");
  }

  const rhr = input.restingHeartRateTrend;
  if (
    (rhr?.deltaFromBaselineBpm ?? Number.NEGATIVE_INFINITY) >= 5 &&
    (rhr?.comparableMornings ?? 0) >= 2 &&
    rhr?.poorWellbeing === true
  ) {
    reasons.push("yellow:rhr_about_plus_5_two_mornings_with_poor_wellbeing");
  }

  if (input.mildSoreness === true) reasons.push("yellow:mild_soreness");
  if (input.heavyButSafeWarmup === true) {
    reasons.push("yellow:heavy_but_safe_warmup");
  }

  return reasons;
}

/**
 * Selects a training action from reported observations. Red stop flags always
 * take precedence. This is an action gate, not a diagnostic assessment.
 */
export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const redReasons = clinicalStopReasons(input);
  const yellowReasons = yellowFactorReasons(input);
  const yellowFactorCount = yellowReasons.length;

  if (redReasons.length > 0) {
    return {
      level: "red",
      reasonCodes: redReasons,
      yellowFactorCount,
      permittedAction: READINESS_ACTIONS.red,
      notice: READINESS_NOTICE,
    };
  }

  const orangeReasons: OrangeReasonCode[] = [];
  if (yellowFactorCount >= 2) {
    orangeReasons.push("orange:multiple_yellow_factors");
  }
  if (input.clearlyExcessiveWarmupOrFirstSetRpe === true) {
    orangeReasons.push("orange:clearly_excessive_warmup_or_first_set_rpe");
  }

  if (orangeReasons.length > 0) {
    return {
      level: "orange",
      reasonCodes: [...orangeReasons, ...yellowReasons],
      yellowFactorCount,
      permittedAction: READINESS_ACTIONS.orange,
      notice: READINESS_NOTICE,
    };
  }

  if (yellowFactorCount === 1) {
    return {
      level: "yellow",
      reasonCodes: yellowReasons,
      yellowFactorCount,
      permittedAction: READINESS_ACTIONS.yellow,
      notice: READINESS_NOTICE,
    };
  }

  return {
    level: "green",
    reasonCodes: ["green:no_adverse_signals"],
    yellowFactorCount: 0,
    permittedAction: READINESS_ACTIONS.green,
    notice: READINESS_NOTICE,
  };
}
