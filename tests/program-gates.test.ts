import assert from "node:assert/strict";
import test from "node:test";
import {
  CONDITIONAL_HEAVY_SINGLE_CYCLES,
  CONDITIONAL_HEAVY_SINGLE_TARGET_RPE,
  V9_13_WARMUP_DELAY_DAYS,
  V9_13_YELLOW_POSTPONE_HOURS,
  decideConditionalHeavySingle,
  decideH26ExtraCableFlySet,
  decideH27CableFlyCarryOver,
  decideH28OptionalCableFlySet,
  decideV913TestBranch,
  isConditionalHeavySingleLocation,
  type ConditionalHeavySingleInput,
  type H27CableFlyCarryOverInput,
  type V913BranchSelectionInput,
  type V913DirectOneRmGates,
  type V9CycleNumber,
} from "../lib/program/gates.ts";

const greenHeavySingle: ConditionalHeavySingleInput = {
  cycle: 6,
  slot: "B2",
  readiness: "green",
  medicalClearanceForPlannedLoadAndStraining: true,
  spotterPresent: true,
  safetiesSet: false,
  redFlagSymptoms: false,
  warmupSafe: true,
  expectedRpe: 6.5,
};

const h27AllFiveConditions: H27CableFlyCarryOverInput = {
  h26ExtraSetCompletedWithGreenReadiness: true,
  h26VisualNeurologicalOrCardiacRedFlags: false,
  h26Pain: 2,
  h26BenchTrajectoryChanged: false,
  h26AllPrimaryPressSetsCompletedWithoutTechnicalStop: true,
  h26LastPausedBenchRpe: 8,
  h26PersistentRecoveryDeclineWithin24To48Hours: false,
  h27PreB2Readiness: "green",
};

const directOneRmAllGates: V913DirectOneRmGates = {
  medicalClearanceForPlannedLoadAndStraining: true,
  ophthalmologyRequirementsSatisfied: true,
  relevantSymptomsOrTechniqueChangingPain: false,
  recentMedicationChangeIllnessDehydrationOrSevereSleepLoss: false,
  v911ConditionalSingleConfident: true,
  v911ConditionalSingleRpe: 8,
  v912B2AndPrimerCompletedWithoutTechniqueDeclineOrSymptoms: true,
  attemptPlanAgreedBeforeWarmupWithQualifiedCoach: true,
  plannedAttempts: 3,
  largeUnverifiedJumpRequired: false,
};

const greenV913 = {
  readiness: "green",
  spotterPresent: true,
  safetiesSet: false,
  sideVideoReady: true,
  heavyWarmup: false,
  technicalIssue: false,
} as const;

type V913CommonOverrides = Partial<{
  readiness: ConditionalHeavySingleInput["readiness"];
  spotterPresent: boolean;
  safetiesSet: boolean;
  sideVideoReady: boolean;
  heavyWarmup: boolean;
  technicalIssue: boolean;
}>;

function directInput(
  gateOverrides: Partial<V913DirectOneRmGates> = {},
  commonOverrides: V913CommonOverrides = {},
): V913BranchSelectionInput {
  return {
    ...greenV913,
    ...commonOverrides,
    requestedBranch: "direct-1rm",
    directOneRm: { ...directOneRmAllGates, ...gateOverrides },
  } as V913BranchSelectionInput;
}

test("conditional heavy singles are programmed only in V9-6, V9-7, V9-9 and V9-11", () => {
  assert.deepEqual(CONDITIONAL_HEAVY_SINGLE_CYCLES, [6, 7, 9, 11]);

  const b2Locations = Array.from({ length: 13 }, (_, index) => index + 1)
    .filter((cycle) => isConditionalHeavySingleLocation(cycle as V9CycleNumber, "B2"));
  assert.deepEqual(b2Locations, [6, 7, 9, 11]);

  for (let cycle = 1; cycle <= 13; cycle += 1) {
    const expected = cycle === 11;
    assert.equal(
      isConditionalHeavySingleLocation(cycle as V9CycleNumber, "B4"),
      expected,
      `unexpected B4 result for V9-${cycle}`,
    );
    assert.equal(isConditionalHeavySingleLocation(cycle as V9CycleNumber, "B1"), false);
    assert.equal(isConditionalHeavySingleLocation(cycle as V9CycleNumber, "B3"), false);
  }
});

test("all green-gated single locations run at expected RPE 6-7 with an absolute cap of 8", () => {
  const locations = [
    [6, "B2", 1],
    [7, "B2", 1],
    [9, "B2", 1],
    [11, "B2", 1],
    [11, "B4", 3],
  ] as const;

  for (const [cycle, slot, plannedSingles] of locations) {
    const decision = decideConditionalHeavySingle({
      ...greenHeavySingle,
      cycle,
      slot,
      expectedRpe: 7,
    });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) throw new Error(`V9-${cycle} ${slot} should be allowed`);
    assert.equal(decision.action, "perform");
    assert.equal(decision.plannedSingles, plannedSingles);
    assert.deepEqual(decision.targetRpe, CONDITIONAL_HEAVY_SINGLE_TARGET_RPE);
    assert.deepEqual(decision.targetRpe, { min: 6, max: 7, absoluteCap: 8 });
  }
});

test("a conditional heavy single fails closed at every gate and is never compensated", () => {
  const failures: Array<{
    name: string;
    patch: Partial<ConditionalHeavySingleInput>;
    reason: string;
  }> = [
    {
      name: "unprogrammed cycle",
      patch: { cycle: 8 },
      reason: "location-not-programmed",
    },
    {
      name: "unprogrammed slot",
      patch: { slot: "B4" },
      reason: "location-not-programmed",
    },
    {
      name: "clearance does not explicitly cover planned load and straining",
      patch: { medicalClearanceForPlannedLoadAndStraining: false },
      reason: "medical-clearance-required",
    },
    {
      name: "yellow readiness",
      patch: { readiness: "yellow" },
      reason: "readiness-not-green",
    },
    {
      name: "orange readiness",
      patch: { readiness: "orange" },
      reason: "readiness-not-green",
    },
    {
      name: "red readiness",
      patch: { readiness: "red" },
      reason: "readiness-not-green",
    },
    {
      name: "red-flag symptom",
      patch: { redFlagSymptoms: true },
      reason: "red-flag-symptoms",
    },
    {
      name: "neither spotter nor safeties",
      patch: { spotterPresent: false, safetiesSet: false },
      reason: "spotter-or-safeties-required",
    },
    {
      name: "unsafe warm-up",
      patch: { warmupSafe: false },
      reason: "warmup-not-safe",
    },
    {
      name: "expected RPE below target",
      patch: { expectedRpe: 5.9 },
      reason: "expected-rpe-outside-6-to-7",
    },
    {
      name: "expected RPE above target but at the cap",
      patch: { expectedRpe: 8 },
      reason: "expected-rpe-outside-6-to-7",
    },
    {
      name: "expected RPE exceeds the absolute cap",
      patch: { expectedRpe: 8.1 },
      reason: "expected-rpe-above-absolute-cap",
    },
    {
      name: "invalid expected RPE",
      patch: { expectedRpe: Number.NaN },
      reason: "invalid-expected-rpe",
    },
  ];

  for (const { name, patch, reason } of failures) {
    const decision = decideConditionalHeavySingle({ ...greenHeavySingle, ...patch });
    assert.equal(decision.allowed, false, name);
    if (decision.allowed) throw new Error(name);
    assert.equal(decision.action, "skip", name);
    assert.equal(decision.plannedSingles, 0, name);
    assert.ok(decision.reasons.includes(reason as never), name);
    assert.equal(decision.compensation, "none", name);
    assert.equal(decision.substitution, "none", name);
  }
});

test("spotter or correctly set safeties independently satisfies the single safety gate", () => {
  const spotter = decideConditionalHeavySingle({
    ...greenHeavySingle,
    spotterPresent: true,
    safetiesSet: false,
  });
  const safeties = decideConditionalHeavySingle({
    ...greenHeavySingle,
    spotterPresent: false,
    safetiesSet: true,
  });
  assert.equal(spotter.allowed, true);
  assert.equal(safeties.allowed, true);
});

test("H2-6 removes the fourth cable-fly set on yellow, pain, RPE >8 or technique decline", () => {
  const allowed = decideH26ExtraCableFlySet({
    readiness: "green",
    pain: false,
    pausedBenchRpe: 8,
    techniqueDeclined: false,
  });
  assert.deepEqual(allowed, {
    allowed: true,
    action: "add-one-set",
    baseSets: 3,
    extraSets: 1,
    totalSets: 4,
    prescription: { sets: 1, reps: "10-12", targetRir: 2, light: true },
  });

  const failures = [
    {
      input: { readiness: "yellow" as const, pain: false, pausedBenchRpe: 8, techniqueDeclined: false },
      reason: "readiness-not-green",
    },
    {
      input: { readiness: "green" as const, pain: true, pausedBenchRpe: 8, techniqueDeclined: false },
      reason: "pain-present",
    },
    {
      input: { readiness: "green" as const, pain: false, pausedBenchRpe: 8.01, techniqueDeclined: false },
      reason: "paused-bench-rpe-invalid-or-above-8",
    },
    {
      input: { readiness: "green" as const, pain: false, pausedBenchRpe: 8, techniqueDeclined: true },
      reason: "technique-declined",
    },
  ];

  for (const { input, reason } of failures) {
    const decision = decideH26ExtraCableFlySet(input);
    assert.equal(decision.allowed, false);
    if (decision.allowed) throw new Error(reason);
    assert.deepEqual(
      {
        action: decision.action,
        baseSets: decision.baseSets,
        extraSets: decision.extraSets,
        totalSets: decision.totalSets,
        compensation: decision.compensation,
        substitution: decision.substitution,
      },
      {
        action: "base-sets-only",
        baseSets: 3,
        extraSets: 0,
        totalSets: 3,
        compensation: "none",
        substitution: "none",
      },
    );
    assert.ok(decision.reasons.includes(reason as never));
  }
});

test("H2-7 carries over the fourth cable-fly set only when all five PDF conditions hold", () => {
  const allowed = decideH27CableFlyCarryOver(h27AllFiveConditions);
  assert.deepEqual(allowed, {
    allowed: true,
    action: "add-one-set",
    baseSets: 3,
    extraSets: 1,
    totalSets: 4,
    prescription: { sets: 1, reps: "10-12", targetRir: 2, light: true },
  });

  const fiveConditionFailures: Array<{
    patch: Partial<H27CableFlyCarryOverInput>;
    reason: string;
  }> = [
    {
      patch: { h26ExtraSetCompletedWithGreenReadiness: false },
      reason: "h2-6-extra-set-was-not-completed-green",
    },
    {
      patch: { h26Pain: 2.01 },
      reason: "h2-6-red-flag-pain-or-trajectory-gate-failed",
    },
    {
      patch: { h26LastPausedBenchRpe: 8.01 },
      reason: "h2-6-pressing-or-rpe-gate-failed",
    },
    {
      patch: { h26PersistentRecoveryDeclineWithin24To48Hours: true },
      reason: "h2-6-recovery-declined-within-24-to-48-hours",
    },
    {
      patch: { h27PreB2Readiness: "yellow" },
      reason: "h2-7-readiness-not-green",
    },
  ];

  for (const { patch, reason } of fiveConditionFailures) {
    const decision = decideH27CableFlyCarryOver({ ...h27AllFiveConditions, ...patch });
    assert.equal(decision.allowed, false);
    if (decision.allowed) throw new Error(reason);
    assert.equal(decision.totalSets, 3);
    assert.equal(decision.compensation, "none");
    assert.equal(decision.substitution, "none");
    assert.ok(decision.reasons.includes(reason as never));
  }
});

test("H2-7 condition groups fail for each red flag, trajectory and technical-stop atomic", () => {
  const cases: Array<{
    patch: Partial<H27CableFlyCarryOverInput>;
    reason: string;
  }> = [
    {
      patch: { h26VisualNeurologicalOrCardiacRedFlags: true },
      reason: "h2-6-red-flag-pain-or-trajectory-gate-failed",
    },
    {
      patch: { h26BenchTrajectoryChanged: true },
      reason: "h2-6-red-flag-pain-or-trajectory-gate-failed",
    },
    {
      patch: { h26Pain: Number.NaN },
      reason: "h2-6-red-flag-pain-or-trajectory-gate-failed",
    },
    {
      patch: { h26AllPrimaryPressSetsCompletedWithoutTechnicalStop: false },
      reason: "h2-6-pressing-or-rpe-gate-failed",
    },
    {
      patch: { h26LastPausedBenchRpe: Number.NaN },
      reason: "h2-6-pressing-or-rpe-gate-failed",
    },
  ];

  for (const { patch, reason } of cases) {
    const decision = decideH27CableFlyCarryOver({ ...h27AllFiveConditions, ...patch });
    assert.equal(decision.allowed, false);
    if (decision.allowed) throw new Error(reason);
    assert.ok(decision.reasons.includes(reason as never));
  }
});

test("H2-8 allows exactly one light set only after four clean bench sets at RPE <=8", () => {
  const allowed = decideH28OptionalCableFlySet({
    readiness: "green",
    benchSetRpes: [7, 7.5, 8, 8],
    cleanTechniqueAcrossAllBenchSets: true,
    painOrSymptoms: false,
    recoveryDeclinedAfterH27: false,
  });
  assert.deepEqual(allowed, {
    allowed: true,
    action: "add-one-set",
    baseSets: 2,
    extraSets: 1,
    totalSets: 3,
    prescription: { sets: 1, reps: "12-15", targetRir: 4, light: true },
  });
});

test("H2-8 omits the optional set whenever any gate fails, without substitution", () => {
  const base = {
    readiness: "green" as const,
    benchSetRpes: [7, 7.5, 8, 8] as readonly number[],
    cleanTechniqueAcrossAllBenchSets: true,
    painOrSymptoms: false,
    recoveryDeclinedAfterH27: false,
  };
  const failures = [
    { patch: { readiness: "yellow" as const }, reason: "readiness-not-green" },
    { patch: { benchSetRpes: [7, 8, 8] }, reason: "bench-set-count-not-four" },
    { patch: { benchSetRpes: [7, 8, 8, 8.01] }, reason: "bench-rpe-invalid-or-above-8" },
    { patch: { benchSetRpes: [7, 8, Number.NaN, 8] }, reason: "bench-rpe-invalid-or-above-8" },
    { patch: { cleanTechniqueAcrossAllBenchSets: false }, reason: "technique-not-clean" },
    { patch: { painOrSymptoms: true }, reason: "pain-or-symptoms" },
    { patch: { recoveryDeclinedAfterH27: true }, reason: "recovery-declined-after-h2-7" },
  ];

  for (const { patch, reason } of failures) {
    const decision = decideH28OptionalCableFlySet({ ...base, ...patch });
    assert.equal(decision.allowed, false);
    if (decision.allowed) throw new Error(reason);
    assert.equal(decision.baseSets, 2);
    assert.equal(decision.extraSets, 0);
    assert.equal(decision.totalSets, 2);
    assert.equal(decision.compensation, "none");
    assert.equal(decision.substitution, "none");
    assert.ok(decision.reasons.includes(reason as never));
  }
});

test("V9-13 defaults to one triple branch and prohibits the direct-1RM branch", () => {
  const decision = decideV913TestBranch(greenV913);
  assert.deepEqual(decision, {
    action: "perform",
    branch: "triple",
    defaultBranch: "triple",
    branchesMutuallyExclusive: true,
    otherBranchProhibited: true,
    selectionReason: "default",
    directOneRmFailures: [],
    plannedAttempts: 1,
  });
});

test("V9-13 selects direct 1RM only when every explicit direct gate holds", () => {
  const decision = decideV913TestBranch(directInput({}, { sideVideoReady: false }));
  assert.deepEqual(decision, {
    action: "perform",
    branch: "direct-1rm",
    defaultBranch: "triple",
    branchesMutuallyExclusive: true,
    otherBranchProhibited: true,
    selectionReason: "requested",
    directOneRmFailures: [],
    plannedAttempts: 3,
  });
});

test("every failed direct-1RM gate falls back to the mutually exclusive triple", () => {
  const failures: Array<{
    patch: Partial<V913DirectOneRmGates>;
    reason: string;
  }> = [
    {
      patch: { medicalClearanceForPlannedLoadAndStraining: false },
      reason: "medical-clearance-required",
    },
    {
      patch: { ophthalmologyRequirementsSatisfied: false },
      reason: "ophthalmology-requirements-not-satisfied",
    },
    {
      patch: { relevantSymptomsOrTechniqueChangingPain: true },
      reason: "relevant-symptoms-or-technique-changing-pain",
    },
    {
      patch: { recentMedicationChangeIllnessDehydrationOrSevereSleepLoss: true },
      reason: "recent-medication-change-illness-dehydration-or-severe-sleep-loss",
    },
    {
      patch: { v911ConditionalSingleConfident: false },
      reason: "v9-11-single-not-confident-at-rpe-8-or-less",
    },
    {
      patch: { v911ConditionalSingleRpe: null },
      reason: "v9-11-single-not-confident-at-rpe-8-or-less",
    },
    {
      patch: { v911ConditionalSingleRpe: 8.01 },
      reason: "v9-11-single-not-confident-at-rpe-8-or-less",
    },
    {
      patch: { v912B2AndPrimerCompletedWithoutTechniqueDeclineOrSymptoms: false },
      reason: "v9-12-b2-or-primer-not-clean",
    },
    {
      patch: { attemptPlanAgreedBeforeWarmupWithQualifiedCoach: false },
      reason: "attempt-plan-not-agreed-before-warmup",
    },
    {
      patch: { plannedAttempts: 0 },
      reason: "planned-attempt-count-not-1-to-3",
    },
    {
      patch: { plannedAttempts: 4 },
      reason: "planned-attempt-count-not-1-to-3",
    },
    {
      patch: { plannedAttempts: 1.5 },
      reason: "planned-attempt-count-not-1-to-3",
    },
    {
      patch: { largeUnverifiedJumpRequired: true },
      reason: "large-unverified-jump-required",
    },
  ];

  for (const { patch, reason } of failures) {
    const decision = decideV913TestBranch(directInput(patch));
    assert.equal(decision.action, "perform");
    if (decision.action !== "perform") throw new Error(reason);
    assert.equal(decision.branch, "triple");
    assert.equal(decision.otherBranchProhibited, true);
    assert.equal(decision.selectionReason, "direct-gates-failed");
    assert.equal(decision.plannedAttempts, 1);
    assert.ok(decision.directOneRmFailures.includes(reason as never));
  }
});

test("V9-13 yellow postpones the triple 24-72 hours and only resumes after green returns", () => {
  const decision = decideV913TestBranch(
    directInput({}, { readiness: "yellow" }),
  );
  assert.deepEqual(decision, {
    action: "postpone",
    branch: "triple",
    defaultBranch: "triple",
    branchesMutuallyExclusive: true,
    delayHours: V9_13_YELLOW_POSTPONE_HOURS,
    resumeOnlyWhenReadiness: "green",
    reason: "yellow-readiness",
  });
  assert.deepEqual(V9_13_YELLOW_POSTPONE_HOURS, { min: 24, max: 72 });
});

test("V9-13 heavy warm-up or technical issue delays 5-7 days or ends the block", () => {
  for (const [patch, expectedReasons] of [
    [{ heavyWarmup: true }, ["heavy-warmup"]],
    [{ technicalIssue: true }, ["technical-issue"]],
    [{ heavyWarmup: true, technicalIssue: true }, ["heavy-warmup", "technical-issue"]],
  ] as const) {
    const decision = decideV913TestBranch({ ...greenV913, ...patch });
    assert.equal(decision.action, "delay-or-end-block");
    if (decision.action !== "delay-or-end-block") {
      throw new Error("expected a delayed or ended block");
    }
    assert.equal(decision.branch, null);
    assert.deepEqual(decision.delayDays, V9_13_WARMUP_DELAY_DAYS);
    assert.deepEqual(decision.delayDays, { min: 5, max: 7 });
    assert.equal(decision.endBlockWithoutTestAllowed, true);
    assert.deepEqual(decision.reasons, expectedReasons);
    assert.equal(decision.compensation, "none");
  }
});

test("V9-13 orange cancels and red enters the medical branch", () => {
  const orange = decideV913TestBranch({
    ...greenV913,
    readiness: "orange",
    heavyWarmup: true,
  });
  assert.deepEqual(orange, {
    action: "cancel",
    branch: null,
    defaultBranch: "triple",
    branchesMutuallyExclusive: true,
    reason: "orange-readiness",
    compensation: "none",
  });

  const red = decideV913TestBranch({
    ...greenV913,
    readiness: "red",
    heavyWarmup: true,
  });
  assert.deepEqual(red, {
    action: "medical-branch",
    branch: null,
    defaultBranch: "triple",
    branchesMutuallyExclusive: true,
    reason: "red-readiness",
    ordinaryTrainingLogicStopped: true,
  });
});

test("V9-13 requires a spotter or safeties, and the triple requires side video", () => {
  const noSafety = decideV913TestBranch({
    ...greenV913,
    spotterPresent: false,
    safetiesSet: false,
  });
  assert.equal(noSafety.action, "cancel");
  if (noSafety.action !== "cancel") throw new Error("missing safety must cancel");
  assert.equal(noSafety.reason, "spotter-or-safeties-required");
  assert.equal(noSafety.compensation, "none");

  const noTripleVideo = decideV913TestBranch({ ...greenV913, sideVideoReady: false });
  assert.equal(noTripleVideo.action, "cancel");
  if (noTripleVideo.action !== "cancel") throw new Error("missing video must cancel the triple");
  assert.equal(noTripleVideo.reason, "side-video-required");

  const safetiesOnly = decideV913TestBranch({
    ...greenV913,
    spotterPresent: false,
    safetiesSet: true,
  });
  assert.equal(safetiesOnly.action, "perform");
  if (safetiesOnly.action !== "perform") throw new Error("safeties should allow the triple");
  assert.equal(safetiesOnly.branch, "triple");
});

test("gate decisions are deterministic and do not mutate array inputs", () => {
  const rpes = Object.freeze([7, 7.5, 8, 8]);
  const input = Object.freeze({
    readiness: "green" as const,
    benchSetRpes: rpes,
    cleanTechniqueAcrossAllBenchSets: true,
    painOrSymptoms: false,
    recoveryDeclinedAfterH27: false,
  });
  const first = decideH28OptionalCableFlySet(input);
  const second = decideH28OptionalCableFlySet(input);
  assert.deepEqual(first, second);
  assert.deepEqual(rpes, [7, 7.5, 8, 8]);
});
