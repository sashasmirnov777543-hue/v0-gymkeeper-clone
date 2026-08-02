import type { ReadinessLevel } from "../readiness.ts";

export type WorkoutSlot = "B1" | "B2" | "B3" | "B4";
export type V9CycleNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13;

/**
 * Редакция 2.0: условная сингловая работа только в V9-8, V9-10 и V9-12
 * (абсолютные циклы 17, 19 и 21). Репетиция 3×1 в V9-11 B4 убрана —
 * её место занял праймер T−4 с ролью primer_single, который синглом не считается.
 */
export const CONDITIONAL_HEAVY_SINGLE_CYCLES = [8, 10, 12] as const;

/** Сколько одиночных повторов запланировано в каждом слоте. */
export const CONDITIONAL_HEAVY_SINGLE_PLANNED: Readonly<Record<number, 1 | 2 | 3>> = {
  8: 2,
  10: 3,
  12: 1,
};

/**
 * Коридор RPE условного сингла.
 *
 * В редакции 2.0 карточки прописывают синглы на 90% (RPE около 7,3–8,0) и на 92,5%
 * (RPE 8). Прежний коридор 6–7,5 отвергал бы сингл цикла 21 на том самом RPE,
 * который предписывает его собственная карточка. Верхняя граница приведена
 * к общему потолку программы: ни один плановый подход не выходит за RPE 8.
 */
export const CONDITIONAL_HEAVY_SINGLE_TARGET_RPE = {
  min: 6,
  max: 8,
  absoluteCap: 8,
} as const;

/** Потолок процента от RMref по уровню медицинского допуска. */
export const CLEARANCE_CEILING_PERCENT = {
  level_1: 85,
  level_2: 92.5,
  level_3: 100,
} as const;
export type GateClearanceLevel = keyof typeof CLEARANCE_CEILING_PERCENT;

type NoCompensation = {
  compensation: "none";
  substitution: "none";
};

export type HeavySingleSkipReason =
  | "location-not-programmed"
  | "medical-clearance-required"
  | "readiness-not-green"
  | "red-flag-symptoms"
  | "spotter-or-safeties-required"
  | "warmup-not-safe"
  | "invalid-expected-rpe"
  | "expected-rpe-above-absolute-cap"
  | "expected-rpe-outside-target-band"
  | "clearance-level-insufficient"
  | "planned-percent-above-clearance-ceiling";

export type ConditionalHeavySingleInput = {
  cycle: V9CycleNumber;
  slot: WorkoutSlot;
  readiness: ReadinessLevel;
  /** Clearance must explicitly cover the planned load and degree of straining. */
  medicalClearanceForPlannedLoadAndStraining: boolean;
  /** Уровень медицинского допуска редакции 2.0. Необязателен для обратной совместимости. */
  clearanceLevel?: GateClearanceLevel;
  /** Запланированный процент от RMref — сверяется с потолком уровня. */
  plannedPercentOfRmref?: number;
  spotterPresent: boolean;
  safetiesSet: boolean;
  redFlagSymptoms: boolean;
  warmupSafe: boolean;
  expectedRpe: number;
};

export type ConditionalHeavySingleDecision =
  | {
      allowed: true;
      action: "perform";
      plannedSingles: 1 | 2 | 3;
      targetRpe: typeof CONDITIONAL_HEAVY_SINGLE_TARGET_RPE;
    }
  | ({
      allowed: false;
      action: "skip";
      plannedSingles: 0;
      reasons: readonly HeavySingleSkipReason[];
    } & NoCompensation);

/**
 * Условный тяжёлый сингл существует только в слоте B2 циклов V9-8, V9-10 и V9-12.
 * Ни в одном другом слоте и ни в одном другом цикле его нет.
 */
export function isConditionalHeavySingleLocation(
  cycle: V9CycleNumber,
  slot: WorkoutSlot,
): boolean {
  return (
    slot === "B2" &&
    (CONDITIONAL_HEAVY_SINGLE_CYCLES as readonly number[]).includes(cycle)
  );
}

/** Fail-closed decision for a conditional heavy single. */
export function decideConditionalHeavySingle(
  input: ConditionalHeavySingleInput,
): ConditionalHeavySingleDecision {
  const reasons: HeavySingleSkipReason[] = [];

  if (!isConditionalHeavySingleLocation(input.cycle, input.slot)) {
    reasons.push("location-not-programmed");
  }
  if (!input.medicalClearanceForPlannedLoadAndStraining) {
    reasons.push("medical-clearance-required");
  }
  if (input.readiness !== "green") reasons.push("readiness-not-green");
  if (input.redFlagSymptoms) reasons.push("red-flag-symptoms");
  if (!input.spotterPresent && !input.safetiesSet) {
    reasons.push("spotter-or-safeties-required");
  }
  if (!input.warmupSafe) reasons.push("warmup-not-safe");

  if (!Number.isFinite(input.expectedRpe)) {
    reasons.push("invalid-expected-rpe");
  } else if (input.expectedRpe > CONDITIONAL_HEAVY_SINGLE_TARGET_RPE.absoluteCap) {
    reasons.push("expected-rpe-above-absolute-cap");
  } else if (
    input.expectedRpe < CONDITIONAL_HEAVY_SINGLE_TARGET_RPE.min ||
    input.expectedRpe > CONDITIONAL_HEAVY_SINGLE_TARGET_RPE.max
  ) {
    reasons.push("expected-rpe-outside-target-band");
  }

  // Уровень допуска: синглы доступны с уровня 2. Дополнительно проверяется,
  // что запланированный процент не выходит за потолок уровня.
  if (input.clearanceLevel) {
    if (input.clearanceLevel === "level_1") {
      reasons.push("clearance-level-insufficient");
    } else if (
      typeof input.plannedPercentOfRmref === "number" &&
      Number.isFinite(input.plannedPercentOfRmref) &&
      input.plannedPercentOfRmref >
        CLEARANCE_CEILING_PERCENT[input.clearanceLevel] + 1e-9
    ) {
      reasons.push("planned-percent-above-clearance-ceiling");
    }
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      action: "skip",
      plannedSingles: 0,
      reasons,
      compensation: "none",
      substitution: "none",
    };
  }

  return {
    allowed: true,
    action: "perform",
    plannedSingles: CONDITIONAL_HEAVY_SINGLE_PLANNED[input.cycle] ?? 1,
    targetRpe: CONDITIONAL_HEAVY_SINGLE_TARGET_RPE,
  };
}

export type ExtraCableFlyPrescription = {
  sets: 1;
  reps: "10-12" | "12-15";
  targetRir: 2 | 4;
  light: true;
};

export type ExtraCableFlySetDecision<Reason extends string = string> =
  | {
      allowed: true;
      action: "add-one-set";
      baseSets: 2 | 3;
      extraSets: 1;
      totalSets: 3 | 4;
      prescription: ExtraCableFlyPrescription;
    }
  | ({
      allowed: false;
      action: "base-sets-only";
      baseSets: 2 | 3;
      extraSets: 0;
      totalSets: 2 | 3;
      reasons: readonly Reason[];
    } & NoCompensation);

function includeExtraCableFlySet(
  baseSets: 2 | 3,
  reps: ExtraCableFlyPrescription["reps"],
  targetRir: ExtraCableFlyPrescription["targetRir"],
): ExtraCableFlySetDecision<never> {
  return {
    allowed: true,
    action: "add-one-set",
    baseSets,
    extraSets: 1,
    totalSets: baseSets === 2 ? 3 : 4,
    prescription: { sets: 1, reps, targetRir, light: true },
  };
}

function omitExtraCableFlySet<Reason extends string>(
  baseSets: 2 | 3,
  reasons: readonly Reason[],
): ExtraCableFlySetDecision<Reason> {
  return {
    allowed: false,
    action: "base-sets-only",
    baseSets,
    extraSets: 0,
    totalSets: baseSets,
    reasons,
    compensation: "none",
    substitution: "none",
  };
}

export type H26ExtraSetFailure =
  | "readiness-not-green"
  | "pain-present"
  | "paused-bench-rpe-invalid-or-above-8"
  | "technique-declined";

export type H26ExtraCableFlySetInput = {
  readiness: ReadinessLevel;
  /** Shoulder or elbow pain relevant to the pressing session. */
  pain: boolean;
  pausedBenchRpe: number;
  techniqueDeclined: boolean;
};

/**
 * УСТАРЕЛО В РЕДАКЦИИ 2.0.
 *
 * Условные добавочные сеты сведений циклов H2-6, H2-7 и H2-8 из программы убраны:
 * грудной объём теперь задан фиксированно и вырос с 7,9 до 11,4–14,9 сета в неделю
 * за счёт объёма, снятого с бицепса. В данных редакции 2.0 условных сетов сведений
 * ноль, и приложение эти функции не вызывает.
 *
 * Код и тесты сохранены как исполняемая документация прежней логики шлюзов
 * и на случай отката к редакции 1.0. Новый код их использовать не должен.
 *
 * @deprecated Не применяется в редакции 2.0.
 */
export function decideH26ExtraCableFlySet(
  input: H26ExtraCableFlySetInput,
): ExtraCableFlySetDecision<H26ExtraSetFailure> {
  const reasons: H26ExtraSetFailure[] = [];
  if (input.readiness !== "green") reasons.push("readiness-not-green");
  if (input.pain) reasons.push("pain-present");
  if (!Number.isFinite(input.pausedBenchRpe) || input.pausedBenchRpe > 8) {
    reasons.push("paused-bench-rpe-invalid-or-above-8");
  }
  if (input.techniqueDeclined) reasons.push("technique-declined");

  return reasons.length > 0
    ? omitExtraCableFlySet(3, reasons)
    : includeExtraCableFlySet(3, "10-12", 2);
}

export type H27CarryOverFailure =
  | "h2-6-extra-set-was-not-completed-green"
  | "h2-6-red-flag-pain-or-trajectory-gate-failed"
  | "h2-6-pressing-or-rpe-gate-failed"
  | "h2-6-recovery-declined-within-24-to-48-hours"
  | "h2-7-readiness-not-green";

export type H27CableFlyCarryOverInput = {
  /** PDF condition 1. */
  h26ExtraSetCompletedWithGreenReadiness: boolean;
  /** PDF condition 2 atomics. Pain is on the 0-10 scale. */
  h26VisualNeurologicalOrCardiacRedFlags: boolean;
  h26Pain: number;
  h26BenchTrajectoryChanged: boolean;
  /** PDF condition 3 atomics. */
  h26AllPrimaryPressSetsCompletedWithoutTechnicalStop: boolean;
  h26LastPausedBenchRpe: number;
  /** PDF condition 4: persistent sleep/readiness/pulse decline after B2 or B4. */
  h26PersistentRecoveryDeclineWithin24To48Hours: boolean;
  /** PDF condition 5. */
  h27PreB2Readiness: ReadinessLevel;
};

/** @deprecated Не применяется в редакции 2.0. См. примечание к decideH26ExtraCableFlySet. */
export function decideH27CableFlyCarryOver(
  input: H27CableFlyCarryOverInput,
): ExtraCableFlySetDecision<H27CarryOverFailure> {
  const reasons: H27CarryOverFailure[] = [];

  if (!input.h26ExtraSetCompletedWithGreenReadiness) {
    reasons.push("h2-6-extra-set-was-not-completed-green");
  }
  if (
    input.h26VisualNeurologicalOrCardiacRedFlags ||
    !Number.isFinite(input.h26Pain) ||
    input.h26Pain < 0 ||
    input.h26Pain > 2 ||
    input.h26BenchTrajectoryChanged
  ) {
    reasons.push("h2-6-red-flag-pain-or-trajectory-gate-failed");
  }
  if (
    !input.h26AllPrimaryPressSetsCompletedWithoutTechnicalStop ||
    !Number.isFinite(input.h26LastPausedBenchRpe) ||
    input.h26LastPausedBenchRpe > 8
  ) {
    reasons.push("h2-6-pressing-or-rpe-gate-failed");
  }
  if (input.h26PersistentRecoveryDeclineWithin24To48Hours) {
    reasons.push("h2-6-recovery-declined-within-24-to-48-hours");
  }
  if (input.h27PreB2Readiness !== "green") {
    reasons.push("h2-7-readiness-not-green");
  }

  return reasons.length > 0
    ? omitExtraCableFlySet(3, reasons)
    : includeExtraCableFlySet(3, "10-12", 2);
}

export type H28OptionalSetFailure =
  | "readiness-not-green"
  | "bench-set-count-not-four"
  | "bench-rpe-invalid-or-above-8"
  | "technique-not-clean"
  | "pain-or-symptoms"
  | "recovery-declined-after-h2-7";

export type H28OptionalCableFlySetInput = {
  readiness: ReadinessLevel;
  benchSetRpes: readonly number[];
  cleanTechniqueAcrossAllBenchSets: boolean;
  painOrSymptoms: boolean;
  recoveryDeclinedAfterH27: boolean;
};

/** @deprecated Не применяется в редакции 2.0. См. примечание к decideH26ExtraCableFlySet. */
export function decideH28OptionalCableFlySet(
  input: H28OptionalCableFlySetInput,
): ExtraCableFlySetDecision<H28OptionalSetFailure> {
  const reasons: H28OptionalSetFailure[] = [];

  if (input.readiness !== "green") reasons.push("readiness-not-green");
  if (input.benchSetRpes.length !== 4) reasons.push("bench-set-count-not-four");
  if (
    input.benchSetRpes.some((rpe) => !Number.isFinite(rpe) || rpe > 8)
  ) {
    reasons.push("bench-rpe-invalid-or-above-8");
  }
  if (!input.cleanTechniqueAcrossAllBenchSets) reasons.push("technique-not-clean");
  if (input.painOrSymptoms) reasons.push("pain-or-symptoms");
  if (input.recoveryDeclinedAfterH27) {
    reasons.push("recovery-declined-after-h2-7");
  }

  return reasons.length > 0
    ? omitExtraCableFlySet(2, reasons)
    : includeExtraCableFlySet(2, "12-15", 4);
}

export const V9_13_YELLOW_POSTPONE_HOURS = { min: 24, max: 72 } as const;
export const V9_13_WARMUP_DELAY_DAYS = { min: 5, max: 7 } as const;
export type V913Branch = "triple" | "direct-1rm";

export type V913DirectOneRmGateFailure =
  | "direct-gate-input-missing"
  | "medical-clearance-required"
  | "ophthalmology-requirements-not-satisfied"
  | "relevant-symptoms-or-technique-changing-pain"
  | "recent-medication-change-illness-dehydration-or-severe-sleep-loss"
  | "v9-11-single-not-confident-at-rpe-8-or-less"
  | "v9-12-b2-or-primer-not-clean"
  | "attempt-plan-not-agreed-before-warmup"
  | "planned-attempt-count-not-1-to-3"
  | "large-unverified-jump-required";

export type V913DirectOneRmGates = {
  medicalClearanceForPlannedLoadAndStraining: boolean;
  /** True means either not required or current specialist assessment is complete. */
  ophthalmologyRequirementsSatisfied: boolean;
  relevantSymptomsOrTechniqueChangingPain: boolean;
  recentMedicationChangeIllnessDehydrationOrSevereSleepLoss: boolean;
  v911ConditionalSingleConfident: boolean;
  v911ConditionalSingleRpe: number | null;
  v912B2AndPrimerCompletedWithoutTechniqueDeclineOrSymptoms: boolean;
  attemptPlanAgreedBeforeWarmupWithQualifiedCoach: boolean;
  plannedAttempts: number;
  largeUnverifiedJumpRequired: boolean;
};

type V913CommonInput = {
  readiness: ReadinessLevel;
  spotterPresent: boolean;
  safetiesSet: boolean;
  sideVideoReady: boolean;
  heavyWarmup: boolean;
  technicalIssue: boolean;
};

export type V913BranchSelectionInput =
  | (V913CommonInput & {
      requestedBranch?: "triple";
      directOneRm?: never;
    })
  | (V913CommonInput & {
      requestedBranch: "direct-1rm";
      directOneRm: V913DirectOneRmGates;
    });

export type V913BranchDecision =
  | {
      action: "perform";
      branch: V913Branch;
      defaultBranch: "triple";
      branchesMutuallyExclusive: true;
      otherBranchProhibited: true;
      selectionReason: "default" | "requested" | "direct-gates-failed";
      directOneRmFailures: readonly V913DirectOneRmGateFailure[];
      plannedAttempts: number;
    }
  | {
      action: "postpone";
      branch: "triple";
      defaultBranch: "triple";
      branchesMutuallyExclusive: true;
      delayHours: typeof V9_13_YELLOW_POSTPONE_HOURS;
      resumeOnlyWhenReadiness: "green";
      reason: "yellow-readiness";
    }
  | {
      action: "delay-or-end-block";
      branch: null;
      defaultBranch: "triple";
      branchesMutuallyExclusive: true;
      delayDays: typeof V9_13_WARMUP_DELAY_DAYS;
      endBlockWithoutTestAllowed: true;
      reasons: readonly ("heavy-warmup" | "technical-issue")[];
      compensation: "none";
    }
  | {
      action: "cancel";
      branch: null;
      defaultBranch: "triple";
      branchesMutuallyExclusive: true;
      reason: "orange-readiness" | "spotter-or-safeties-required" | "side-video-required";
      compensation: "none";
    }
  | {
      action: "medical-branch";
      branch: null;
      defaultBranch: "triple";
      branchesMutuallyExclusive: true;
      reason: "red-readiness";
      ordinaryTrainingLogicStopped: true;
    };

function directOneRmGateFailures(
  gates: V913DirectOneRmGates | undefined,
): V913DirectOneRmGateFailure[] {
  if (!gates) return ["direct-gate-input-missing"];

  const failures: V913DirectOneRmGateFailure[] = [];
  if (!gates.medicalClearanceForPlannedLoadAndStraining) {
    failures.push("medical-clearance-required");
  }
  if (!gates.ophthalmologyRequirementsSatisfied) {
    failures.push("ophthalmology-requirements-not-satisfied");
  }
  if (gates.relevantSymptomsOrTechniqueChangingPain) {
    failures.push("relevant-symptoms-or-technique-changing-pain");
  }
  if (gates.recentMedicationChangeIllnessDehydrationOrSevereSleepLoss) {
    failures.push("recent-medication-change-illness-dehydration-or-severe-sleep-loss");
  }
  if (
    !gates.v911ConditionalSingleConfident ||
    gates.v911ConditionalSingleRpe == null ||
    !Number.isFinite(gates.v911ConditionalSingleRpe) ||
    gates.v911ConditionalSingleRpe > 8
  ) {
    failures.push("v9-11-single-not-confident-at-rpe-8-or-less");
  }
  if (!gates.v912B2AndPrimerCompletedWithoutTechniqueDeclineOrSymptoms) {
    failures.push("v9-12-b2-or-primer-not-clean");
  }
  if (!gates.attemptPlanAgreedBeforeWarmupWithQualifiedCoach) {
    failures.push("attempt-plan-not-agreed-before-warmup");
  }
  if (
    !Number.isInteger(gates.plannedAttempts) ||
    gates.plannedAttempts < 1 ||
    gates.plannedAttempts > 3
  ) {
    failures.push("planned-attempt-count-not-1-to-3");
  }
  if (gates.largeUnverifiedJumpRequired) {
    failures.push("large-unverified-jump-required");
  }
  return failures;
}

/**
 * V9-13 selector. It always returns zero or one executable branch; a triple and
 * a direct 1RM can never be selected together.
 */
export function decideV913TestBranch(
  input: V913BranchSelectionInput,
): V913BranchDecision {
  if (input.readiness === "red") {
    return {
      action: "medical-branch",
      branch: null,
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      reason: "red-readiness",
      ordinaryTrainingLogicStopped: true,
    };
  }

  if (input.readiness === "orange") {
    return {
      action: "cancel",
      branch: null,
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      reason: "orange-readiness",
      compensation: "none",
    };
  }

  if (input.readiness === "yellow") {
    return {
      action: "postpone",
      branch: "triple",
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      delayHours: V9_13_YELLOW_POSTPONE_HOURS,
      resumeOnlyWhenReadiness: "green",
      reason: "yellow-readiness",
    };
  }

  const warmupReasons: Array<"heavy-warmup" | "technical-issue"> = [];
  if (input.heavyWarmup) warmupReasons.push("heavy-warmup");
  if (input.technicalIssue) warmupReasons.push("technical-issue");
  if (warmupReasons.length > 0) {
    return {
      action: "delay-or-end-block",
      branch: null,
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      delayDays: V9_13_WARMUP_DELAY_DAYS,
      endBlockWithoutTestAllowed: true,
      reasons: warmupReasons,
      compensation: "none",
    };
  }

  if (!input.spotterPresent && !input.safetiesSet) {
    return {
      action: "cancel",
      branch: null,
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      reason: "spotter-or-safeties-required",
      compensation: "none",
    };
  }

  if (input.requestedBranch === "direct-1rm") {
    const directFailures = directOneRmGateFailures(input.directOneRm);
    if (directFailures.length === 0) {
      return {
        action: "perform",
        branch: "direct-1rm",
        defaultBranch: "triple",
        branchesMutuallyExclusive: true,
        otherBranchProhibited: true,
        selectionReason: "requested",
        directOneRmFailures: [],
        plannedAttempts: input.directOneRm.plannedAttempts,
      };
    }

    if (!input.sideVideoReady) {
      return {
        action: "cancel",
        branch: null,
        defaultBranch: "triple",
        branchesMutuallyExclusive: true,
        reason: "side-video-required",
        compensation: "none",
      };
    }

    return {
      action: "perform",
      branch: "triple",
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      otherBranchProhibited: true,
      selectionReason: "direct-gates-failed",
      directOneRmFailures: directFailures,
      plannedAttempts: 1,
    };
  }

  if (!input.sideVideoReady) {
    return {
      action: "cancel",
      branch: null,
      defaultBranch: "triple",
      branchesMutuallyExclusive: true,
      reason: "side-video-required",
      compensation: "none",
    };
  }

  return {
    action: "perform",
    branch: "triple",
    defaultBranch: "triple",
    branchesMutuallyExclusive: true,
    otherBranchProhibited: true,
    selectionReason: "default",
    directOneRmFailures: [],
    plannedAttempts: 1,
  };
}
