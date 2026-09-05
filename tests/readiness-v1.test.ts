import assert from "node:assert/strict";
import test from "node:test";
import {
  assessReadiness,
  CLINICAL_STOP_FLAGS,
  READINESS_ACTIONS,
  READINESS_NOTICE,
  type ReadinessInput,
  type YellowReasonCode,
} from "../lib/readiness.ts";

for (const flag of CLINICAL_STOP_FLAGS) {
  test(`clinical stop flag ${flag} is red`, () => {
    const result = assessReadiness({
      clinicalStopFlags: { [flag]: true },
    });

    assert.equal(result.level, "red");
    assert.deepEqual(result.reasonCodes, [`red:${flag}`]);
    assert.deepEqual(result.permittedAction, READINESS_ACTIONS.red);
    assert.equal(result.permittedAction.training.mode, "none");
    assert.equal(result.permittedAction.training.warmup, "not_permitted");
    assert.equal(result.permittedAction.medicalBranch.required, true);
  });
}

test("a clinical stop flag takes precedence over orange and yellow observations", () => {
  const result = assessReadiness({
    clinicalStopFlags: { chest_pressure: true },
    poorSleep: true,
    mildSoreness: true,
    clearlyExcessiveWarmupOrFirstSetRpe: true,
  });

  assert.equal(result.level, "red");
  assert.deepEqual(result.reasonCodes, ["red:chest_pressure"]);
  assert.equal(result.yellowFactorCount, 2);
  assert.deepEqual(result.permittedAction, READINESS_ACTIONS.red);
});

const singleYellowCases: ReadonlyArray<
  readonly [string, ReadinessInput, YellowReasonCode]
> = [
  ["poor sleep", { poorSleep: true }, "yellow:poor_sleep"],
  [
    "unusual shift fatigue",
    { unusualShiftFatigue: true },
    "yellow:unusual_shift_fatigue",
  ],
  [
    "RHR trend with poor wellbeing",
    {
      restingHeartRateTrend: {
        deltaFromBaselineBpm: 5,
        comparableMornings: 2,
        poorWellbeing: true,
      },
    },
    "yellow:rhr_about_plus_5_two_mornings_with_poor_wellbeing",
  ],
  ["mild soreness", { mildSoreness: true }, "yellow:mild_soreness"],
  [
    "heavy but safe warm-up",
    { heavyButSafeWarmup: true },
    "yellow:heavy_but_safe_warmup",
  ],
];

for (const [name, input, reasonCode] of singleYellowCases) {
  test(`${name} alone is yellow`, () => {
    const result = assessReadiness(input);

    assert.equal(result.level, "yellow");
    assert.deepEqual(result.reasonCodes, [reasonCode]);
    assert.equal(result.yellowFactorCount, 1);
    assert.deepEqual(result.permittedAction, READINESS_ACTIONS.yellow);
  });
}

test("RHR alone is not yellow unless all trend conditions are present", () => {
  const incompleteTrends: ReadinessInput[] = [
    {
      restingHeartRateTrend: {
        deltaFromBaselineBpm: 4.9,
        comparableMornings: 2,
        poorWellbeing: true,
      },
    },
    {
      restingHeartRateTrend: {
        deltaFromBaselineBpm: 5,
        comparableMornings: 1,
        poorWellbeing: true,
      },
    },
    {
      restingHeartRateTrend: {
        deltaFromBaselineBpm: 5,
        comparableMornings: 2,
        poorWellbeing: false,
      },
    },
  ];

  for (const input of incompleteTrends) {
    assert.equal(assessReadiness(input).level, "green");
  }
});

test("multiple yellow factors escalate to orange", () => {
  const result = assessReadiness({
    poorSleep: true,
    unusualShiftFatigue: true,
  });

  assert.equal(result.level, "orange");
  assert.deepEqual(result.reasonCodes, [
    "orange:multiple_yellow_factors",
    "yellow:poor_sleep",
    "yellow:unusual_shift_fatigue",
  ]);
  assert.equal(result.yellowFactorCount, 2);
  assert.deepEqual(result.permittedAction, READINESS_ACTIONS.orange);
});

test("clearly excessive warm-up or first-set RPE is orange without a red flag", () => {
  const result = assessReadiness({
    clearlyExcessiveWarmupOrFirstSetRpe: true,
  });

  assert.equal(result.level, "orange");
  assert.deepEqual(result.reasonCodes, [
    "orange:clearly_excessive_warmup_or_first_set_rpe",
  ]);
  assert.equal(result.yellowFactorCount, 0);
  assert.deepEqual(result.permittedAction, READINESS_ACTIONS.orange);
});

test("no adverse signals is green", () => {
  const result = assessReadiness({});

  assert.equal(result.level, "green");
  assert.deepEqual(result.reasonCodes, ["green:no_adverse_signals"]);
  assert.equal(result.yellowFactorCount, 0);
  assert.deepEqual(result.permittedAction, READINESS_ACTIONS.green);
});

test("permitted actions encode the full traffic-light restrictions", () => {
  assert.equal(READINESS_ACTIONS.green.training.mode, "full_plan");
  assert.equal(READINESS_ACTIONS.green.cardio.mode, "as_planned");

  assert.equal(READINESS_ACTIONS.yellow.training.singles, "not_permitted");
  assert.equal(READINESS_ACTIONS.yellow.training.tests, "not_permitted");
  assert.equal(
    READINESS_ACTIONS.yellow.training.intensityTechniques,
    "not_permitted",
  );
  assert.deepEqual(
    READINESS_ACTIONS.yellow.training.adjustment.weightReductionPercent,
    [5, 5],
  );
  assert.equal(READINESS_ACTIONS.yellow.training.adjustment.setsToRemove, 1);
  assert.deepEqual(READINESS_ACTIONS.yellow.cardio.minutes, [0, 15]);
  assert.deepEqual(READINESS_ACTIONS.yellow.cardio.options, [
    "z1",
    "walk",
    "skip",
  ]);

  assert.equal(READINESS_ACTIONS.orange.training.mode, "technique_only");
  assert.deepEqual(
    READINESS_ACTIONS.orange.training.loadPercentRmref,
    [50, 60],
  );
  assert.deepEqual(READINESS_ACTIONS.orange.training.sets, [2, 2]);
  assert.equal(READINESS_ACTIONS.orange.training.repsPerSet, 3);
  assert.equal(
    READINESS_ACTIONS.orange.training.accessories.volumeReductionPercent,
    100,
  );
  assert.equal(READINESS_ACTIONS.orange.training.accessories.maySkip, true);
  assert.equal(READINESS_ACTIONS.orange.training.singles, "not_permitted");
  assert.equal(READINESS_ACTIONS.orange.training.tests, "not_permitted");
  assert.equal(READINESS_ACTIONS.orange.cardio.symptomFreeOnly, true);
  assert.deepEqual(READINESS_ACTIONS.orange.cardio.minutes, [0, 0]);
  assert.deepEqual(READINESS_ACTIONS.orange.cardio.options, [
    "z1",
    "walk",
    "rest",
  ]);

  assert.equal(READINESS_ACTIONS.red.training.mode, "none");
  assert.equal(READINESS_ACTIONS.red.training.warmup, "not_permitted");
  assert.equal(READINESS_ACTIONS.red.cardio.mode, "none");
  assert.equal(READINESS_ACTIONS.red.medicalBranch.required, true);
});

test("the result states that the model is an action gate, not a diagnosis", () => {
  const result = assessReadiness({ poorSleep: true });

  assert.equal(result.notice, READINESS_NOTICE);
  assert.match(result.notice, /does not make a medical diagnosis/i);
});

test("assessment is deterministic and does not mutate its input", () => {
  const input: ReadinessInput = Object.freeze({
    clinicalStopFlags: Object.freeze({ vision_symptoms: false }),
    poorSleep: true,
  });
  const snapshot = structuredClone(input);

  const first = assessReadiness(input);
  const second = assessReadiness(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(first, second);
});
