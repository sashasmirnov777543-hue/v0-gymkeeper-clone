import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { H2_V9_PROGRAM } from "../lib/program/index.ts";
import { validateProgram } from "../lib/program/validate.ts";
import {
  DEFAULT_SAFETY_PROFILE,
  startingWeight,
  floorToStep,
  ceilingFromPercent,
  buildWarmup,
  cardioPlan,
  sessionStartReasons,
  sessionStopState,
  nextSetAdvice,
  comparableTripleIndex,
  effectiveSafetyProfile,
  type EffortSet,
} from "../lib/program/policy.ts";
import {
  prepareExercises,
  type ExerciseInput,
} from "../lib/program/session-plan.ts";
import {
  repeatedSchemeStart,
  reviewTrainingBase,
  accessoryProgression,
  type CompletedExposure,
} from "../lib/program/progression.ts";
import { assessReadiness } from "../lib/readiness.ts";
import { e1rmForStats } from "../lib/stats.ts";
const profile = {
  ...DEFAULT_SAFETY_PROFILE,
  reviewed: true,
  baseConfirmed: true,
  loadCeilingKg: 105,
};
const clean = {
  pauseQuality: "clean",
  touchPoint: "stable",
  trajectoryQuality: "clean",
  techniqueSigns: [],
  symptoms: [],
};
// Independent transcription of the agreed 44 main prescriptions, not derived from the generator.
const matrix = [
  [
    [
      [1, 3, null],
      [2, 6, 80],
    ],
    [[3, 6, 77.5]],
  ],
  [[[4, 6, 82.5]], [[3, 8, 75]]],
  [[[4, 6, 85]], [[3, 8, 77.5]]],
  [[[4, 6, 87.5]], [[3, 8, 80]]],
  [
    [
      [1, 3, null],
      [2, 5, 75],
    ],
    [[2, 5, 70]],
  ],
  [[[4, 5, 87.5]], [[3, 6, 82.5]]],
  [[[4, 5, 90]], [[4, 6, 82.5]]],
  [[[4, 5, 90]], [[4, 6, 85]]],
  [
    [
      [1, 3, null],
      [2, 4, 80],
    ],
    [[2, 5, 75]],
  ],
  [[[4, 4, 90]], [[3, 5, 85]]],
  [[[4, 4, 92.5]], [[4, 4, 87.5]]],
  [[[4, 3, 95]], [[4, 4, 90]]],
  [[[3, 3, 97.5]], [[3, 3, 92.5]]],
  [
    [
      [1, 3, null],
      [2, 3, 80],
    ],
    [[2, 4, 75]],
  ],
  [[[4, 3, 95]], [[3, 4, 90]]],
  [[[4, 2, 97.5]], [[4, 3, 92.5]]],
  [[[3, 2, 100]], [[3, 3, 95]]],
  [[[2, 3, 85]], [[2, 3, 80]]],
  [
    [
      [3, 2, 100],
      [1, 3, 92.5],
    ],
    [[3, 3, 95]],
  ],
  [
    [
      [1, 3, null],
      [1, 2, 92.5],
    ],
    [[2, 3, 85]],
  ],
  [[[2, 2, 97.5]], [[2, 2, 85]]],
  [[[1, 3, null]], [[2, 5, 57.5]]],
];
const minutes = [
  [15, 30],
  [20, 35],
  [20, 35],
  [20, 40],
  [15, 25],
  [20, 35],
  [20, 40],
  [20, 40],
  [15, 25],
  [20, 35],
  [20, 35],
  [20, 35],
  [20, 35],
  [15, 25],
  [20, 35],
  [20, 35],
  [15, 30],
  [15, 25],
  [15, 30],
  [15, 25],
  [10, 15],
  [0, 20],
];
for (let i = 0; i < 22; i++)
  test(`3.0 cycle ${i + 1}: both gyms and exact total cardio`, () => {
    const c = H2_V9_PROGRAM.cycles[i];
    assert.ok(c);
    const gyms = c.workouts.filter((w) => w.kind === "strength");
    const actual = gyms.map((w) =>
      w.exercises
        .filter((e) =>
          [
            "primary_bench",
            "primary_backoff",
            "calibration",
            "test_triple",
          ].includes(e.role),
        )
        .map((e) => [Number(e.sets), Number(e.reps), e.exampleKg?.min ?? null]),
    );
    assert.deepEqual(actual, matrix[i]);
    assert.deepEqual(
      c.workouts
        .filter((w) => w.kind === "cardio")
        .map((w) => w.duration?.min ?? 0),
      minutes[i],
    );
  });
test("active version and six controls; no mandatory singles; rest day 171", () => {
  assert.equal(H2_V9_PROGRAM.version, "h2-v9-4.0");
  assert.equal(H2_V9_PROGRAM.source.revision, "3.0");
  assert.equal(validateProgram(H2_V9_PROGRAM).valid, true);
  const cards = H2_V9_PROGRAM.cycles.flatMap((c) =>
    c.workouts.map((w) => ({ c, w })),
  );
  assert.equal(cards.length, 88);
  assert.deepEqual(
    cards.filter(({ w }) => w.isControl).map(({ c, w }) => c.dayOffset + w.day),
    [4, 36, 68, 108, 156, 172],
  );
  assert.equal(
    cards.some(({ w }) =>
      w.exercises.some(
        (e) => e.role === "conditional_single" || e.role === "direct_1rm",
      ),
    ),
    false,
  );
  const rest = cards.find(({ c, w }) => c.dayOffset + w.day === 171)!.w;
  assert.equal(rest.isRestDay, true);
  assert.equal(rest.duration?.min, 0);
  assert.deepEqual(rest.exercises, []);
  assert.equal(
    cards.filter(({ w }) => w.branches?.some((b) => b.id === "direct_1rm"))
      .length,
    5,
  );
});
test("weight rounding, separately floored C and fixed cap across R changes", () => {
  assert.equal(
    startingWeight(95, 120, { ...profile, loadCeilingKg: null }),
    100,
  );
  assert.equal(
    startingWeight(95, 120, { ...profile, loadCeilingKg: 97.5 }),
    97.5,
  );
  assert.equal(ceilingFromPercent(115, 85, 2.5), 97.5);
  assert.equal(ceilingFromPercent(115, 92.5, 2.5), 105);
  assert.equal(floorToStep(106.375), 105);
  assert.equal(
    effectiveSafetyProfile(
      { ...profile, loadCeilingKg: 100 },
      { ...profile, loadCeilingKg: 105 },
    ).loadCeilingKg,
    100,
  );
  assert.equal(
    effectiveSafetyProfile(profile, { ...profile, loadCeilingKg: 90 })
      .loadCeilingKg,
    90,
  );
});
test("warmup is increasing, deduplicated and below work/C", () => {
  for (const weight of [20, 30, 57.5, 80, 100, 110]) {
    const steps = buildWarmup(weight, profile, "control");
    const weights = steps.map((x) => x.weightKg);
    assert.equal(new Set(weights).size, weights.length);
    assert.ok(
      weights.every(
        (w, i) => w < weight && w <= 105 && (i === 0 || w > weights[i - 1]),
      ),
    );
  }
});
test("yellow cardio never increases a short session and zero stays zero", () => {
  for (const n of [0, 5, 10, 15, 20, 40]) {
    assert.equal(cardioPlan(n, "yellow").minutes, Math.min(n, 15));
    assert.equal(cardioPlan(n, "orange").minutes, 0);
    assert.equal(cardioPlan(n, "red").minutes, 0);
    assert.equal(cardioPlan(n, "green", { minutes: 60 }).minutes, n);
  }
});
test("readiness prescription is minus five percent AND one set; orange 2x3", () => {
  const y = assessReadiness({ poorSleep: true });
  assert.equal(y.level, "yellow");
  if (y.permittedAction.training.mode !== "reduced_plan")
    throw Error("wrong action");
  assert.equal(
    y.permittedAction.training.adjustment.choice,
    "reduce_one_set_and_weight",
  );
  assert.deepEqual(
    y.permittedAction.training.adjustment.weightReductionPercent,
    [5, 5],
  );
  const o = assessReadiness({ clearlyExcessiveWarmupOrFirstSetRpe: true });
  if (o.permittedAction.training.mode !== "technique_only")
    throw Error("wrong action");
  assert.deepEqual(o.permittedAction.training.sets, [2, 2]);
  assert.deepEqual(o.permittedAction.training.loadPercentRmref, [50, 60]);
  assert.equal(
    o.permittedAction.training.accessories.volumeReductionPercent,
    100,
  );
});
const input: ExerciseInput = {
  id: 1,
  name: "Жим лёжа с паузой",
  weightText: null,
  targetSets: "4",
  targetReps: "6",
  targetRirMin: null,
  targetRirMax: null,
  targetRpeMin: 6,
  targetRpeMax: 8,
  role: "primary_bench",
  isOptional: false,
  comment: null,
  restSeconds: 180,
  exampleKgMin: "85",
  prescription: {
    key: "paused_bench_0",
    exampleKg: { min: 85, max: 85 },
    progressionEligible: true,
  },
};
test("shared preparation adapts real prescriptions and branch replacement", () => {
  const context = {
    baseKg: 115,
    profile,
    isControl: false,
    isDeload: false,
    isTaper: false,
    readiness: "yellow",
  };
  const yellow = prepareExercises([input], context);
  assert.equal(yellow[0].targetSets, "3");
  assert.equal(yellow[0].plannedKg, 80);
  assert.equal(yellow[0].progressionEligible, false);
  const orange = prepareExercises([input], { ...context, readiness: "orange" });
  assert.equal(orange[0].targetSets, "2");
  assert.equal(orange[0].targetReps, "3");
  assert.equal(orange[0].targetRpeMax, 6);
  assert.deepEqual(
    prepareExercises([input], { ...context, readiness: "red" }),
    [],
  );
  const alt = {
    ...input,
    id: 2,
    role: "conditional_single",
    prescription: {
      branchId: "direct_1rm",
      key: "optional_single",
      exampleKg: { min: 102.5, max: 102.5 },
    },
  };
  const selected = prepareExercises([input, alt], {
    ...context,
    readiness: "green",
    branch: "direct_1rm",
  });
  assert.deepEqual(
    selected.map((e) => e.id),
    [2],
  );
});
test("ordinary RPE 8 stops main; clean control only permits printed light sets", () => {
  const ordinary: EffortSet = {
    workoutExerciseId: 1,
    role: "primary_bench",
    weight: 90,
    reps: 3,
    rpe: 8,
    ...clean,
  };
  assert.equal(sessionStopState([ordinary], profile).ordinaryMainStopped, true);
  const control = { ...ordinary, role: "calibration", weight: 100 };
  assert.equal(sessionStopState([control], profile).cleanControl, true);
  assert.equal(
    sessionStopState([{ ...control, techniqueSigns: ["grinder"] }], profile)
      .stopPress,
    true,
  );
  assert.equal(
    sessionStopState([{ ...ordinary, symptoms: ["medical_symptom"] }], profile)
      .stopAll,
    true,
  );
  assert.equal(
    sessionStopState([{ ...ordinary, weight: 110 }], profile).stopAll,
    true,
  );
});
test("warmup sets do not satisfy work count; factual effort missing never earns an increase", () => {
  const advice = nextSetAdvice({
    sets: [
      {
        workoutExerciseId: 1,
        role: "primary_bench",
        weight: 50,
        reps: 5,
        isWarmup: true,
      },
    ],
    exerciseId: 1,
    role: "primary_bench",
    targetSets: 4,
    targetRpeMax: 8,
    plannedKg: 85,
    profile,
    readiness: "green",
    progressionEligible: true,
  });
  assert.equal(advice.blocked, false);
  assert.equal(advice.weight, 85);
  const missing = nextSetAdvice({
    sets: [
      {
        workoutExerciseId: 1,
        role: "primary_bench",
        weight: 85,
        reps: 6,
        rpe: null,
        ...clean,
      },
    ],
    exerciseId: 1,
    role: "primary_bench",
    targetSets: 4,
    targetRpeMax: 8,
    plannedKg: 85,
    profile,
    readiness: "green",
    progressionEligible: true,
  });
  assert.equal(missing.weight, 85);
});
function exposure(id: number, rpe = 7): CompletedExposure {
  return {
    sessionId: id,
    signature: "bench|4x6|RPE=8|R=115",
    baseKg: 115,
    green: true,
    completed: true,
    plannedSets: 4,
    plannedReps: "6",
    sets: Array.from({ length: 4 }, () => ({
      workoutExerciseId: 1,
      role: "primary_bench",
      weight: 85,
      reps: 6,
      rpe,
      ...clean,
    })),
  };
}
test("exact-scheme progression needs two complete comparable exposures", () => {
  const args = {
    signature: exposure(1).signature,
    baseKg: 115,
    candidateKg: 87.5,
    eligible: true,
    profile,
  };
  assert.equal(
    repeatedSchemeStart({ ...args, exposures: [exposure(2)] }).weightKg,
    85,
  );
  assert.equal(
    repeatedSchemeStart({ ...args, exposures: [exposure(2), exposure(1)] })
      .weightKg,
    87.5,
  );
  assert.equal(
    repeatedSchemeStart({ ...args, exposures: [exposure(2, 9), exposure(1)] })
      .weightKg,
    85,
  );
  assert.equal(
    repeatedSchemeStart({
      ...args,
      signature: "bench|4x6|RPE=7.5|R=115",
      exposures: [exposure(2), exposure(1)],
    }).raised,
    false,
  );
  assert.equal(
    repeatedSchemeStart({
      ...args,
      signature: "bench|5x6|RPE=8|R=115",
      exposures: [exposure(2)],
    }).weightKg,
    85,
  );
});
test("base change needs control plus two sessions and cannot rise in taper", () => {
  const evidence = (
    [
      { kind: "control", sessionId: 1 },
      { kind: "ordinary", sessionId: 2 },
      { kind: "ordinary", sessionId: 3 },
    ] as const
  ).map((e) => ({
    ...e,
    green: true,
    completed: true,
    comparable: true,
    progressConfirmed: true,
  }));
  assert.equal(
    reviewTrainingBase({
      current: 115,
      proposed: 117.5,
      programDay: 100,
      evidence,
      baseConfirmed: true,
    }).allowed,
    true,
  );
  assert.equal(
    reviewTrainingBase({
      current: 115,
      proposed: 117.5,
      programDay: 156,
      evidence,
      baseConfirmed: true,
    }).allowed,
    false,
  );
  assert.equal(
    reviewTrainingBase({
      current: 115,
      proposed: 120,
      programDay: 100,
      evidence,
      baseConfirmed: true,
    }).allowed,
    false,
  );
  assert.equal(
    reviewTrainingBase({
      current: 115,
      proposed: 117.5,
      programDay: 100,
      evidence: evidence.slice(0, 2),
      baseConfirmed: true,
    }).allowed,
    false,
  );
});
test("double progression uses actual RIR, and statistics require comparable 3@8", () => {
  const rows = Array.from({ length: 2 }, () => ({
    workoutExerciseId: 1,
    weight: 20,
    reps: 12,
    rir: 3,
    ...clean,
  }));
  assert.equal(
    accessoryProgression({
      sets: rows,
      previous: rows,
      targetSets: 2,
      repMax: 12,
      rirMin: 3,
      stepKg: 1,
    }).canIncrease,
    true,
  );
  assert.equal(
    accessoryProgression({
      sets: rows.map((s) => ({ ...s, rir: null })),
      previous: rows,
      targetSets: 2,
      repMax: 12,
      rirMin: 3,
      stepKg: 1,
    }).canIncrease,
    false,
  );
  assert.equal(e1rmForStats("Жим лёжа", 100, 3), null);
  assert.equal(comparableTripleIndex(100, 3, 7, true), null);
  assert.equal(
    e1rmForStats("Жим лёжа", 100, 3, { role: "calibration", rpe: 8, ...clean }),
    115.9,
  );
});
test("start guard blocks rest/red and never grants a universal percentage clearance", () => {
  const args = {
    profile,
    readiness: "green" as const,
    kind: "strength",
    isRestDay: false,
    isControl: false,
    directBranch: false,
    finalTest: false,
    cycle: 2,
    spotterPresent: true,
    safetiesSet: false,
  };
  assert.deepEqual(sessionStartReasons(args), []);
  assert.ok(sessionStartReasons({ ...args, isRestDay: true }).length);
  assert.ok(sessionStartReasons({ ...args, readiness: "red" }).length);
  assert.ok(sessionStartReasons({ ...args, isControl: true }).length);
  assert.ok(
    sessionStartReasons({ ...args, profile: DEFAULT_SAFETY_PROFILE }).length,
  );
});
test("active client/server paths use snapshots, guards and acknowledgement IDs", () => {
  const text = (p: string) =>
    readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const action = text("app/actions/workout.ts");
  assert.match(action, /createStartSnapshot/);
  assert.match(action, /await guardSet/);
  assert.match(action, /revision30:\s*prepared.snapshot/);
  assert.ok(
    action.indexOf("if (!active)") <
      action.indexOf(
        "await tx.delete(loggedSets)",
        action.indexOf("export async function cancelSession"),
      ),
  );
  const logger = text("components/session-logger.tsx");
  assert.doesNotMatch(logger, /recommendWeight\(|rpeFromLastRep|decideDelta\(/);
  assert.match(logger, /useState<number\s*\|\s*null>\(null\)/);
  const offline = text("lib/offline.ts");
  assert.match(offline, /acknowledged.has\(op.operationId\)/);
  assert.doesNotMatch(offline, /slice\(ops.length\)/);
  const restore = text("app/api/import/json/route.ts");
  assert.match(restore, /016_seed_h2_v9_v4.sql/);
  assert.match(restore, /columns.includes\("id"\)/);
});
