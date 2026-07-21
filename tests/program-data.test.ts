import assert from "node:assert/strict";
import test from "node:test";
import {
  H2_V9_PROGRAM,
  H2_V9_PROGRAM_VALIDATION,
  getProgramCycle,
  getProgramWorkout,
  listProgramWorkouts,
} from "../lib/program/index.ts";


test("canonical program has 176 days, 22 cycles and 88 B-slots", () => {
  assert.equal(H2_V9_PROGRAM.version, "h2-v9-1.0");
  assert.equal(H2_V9_PROGRAM.durationDays, 176);
  assert.equal(H2_V9_PROGRAM.cycles.length, 22);
  assert.equal(H2_V9_PROGRAM.cycles.filter((cycle) => cycle.block === "h2").length, 9);
  assert.equal(H2_V9_PROGRAM.cycles.filter((cycle) => cycle.block === "v9").length, 13);
  assert.equal(listProgramWorkouts().length, 88);
  assert.deepEqual(H2_V9_PROGRAM_VALIDATION.errors, []);
  assert.equal(H2_V9_PROGRAM_VALIDATION.valid, true);
});


test("every cycle follows B1/B2/B3/B4 on days 3/4/7/8", () => {
  for (const cycle of H2_V9_PROGRAM.cycles) {
    assert.deepEqual(
      cycle.workouts.map(({ slot, day }) => [slot, day]),
      [
        ["B1", 3],
        ["B2", 4],
        ["B3", 7],
        ["B4", 8],
      ],
      cycle.id,
    );
  }
});


test("H2-5 is a full deload instead of a normal accessory day", () => {
  const cycle = getProgramCycle("h2", 5);
  assert.ok(cycle);
  const b2 = getProgramWorkout("h2", 5, "B2");
  const b4 = getProgramWorkout("h2", 5, "B4");
  assert.ok(b2);
  assert.ok(b4);
  assert.equal(b2.duration?.max, 55);
  assert.equal(b4.duration?.max, 55);
  assert.equal(b2.exercises.length, 5);
  assert.equal(b4.exercises.length, 5);
  assert.equal(b2.exercises.find((exercise) => /тяга Т-штанги/i.test(exercise.name))?.sets, "2");
  assert.equal(b4.exercises.find((exercise) => /горизонтальная тяга/i.test(exercise.name))?.sets, "2");
});


test("conditional heavy singles exist only at the approved V9 locations", () => {
  const actual: string[] = [];
  for (const cycle of H2_V9_PROGRAM.cycles) {
    for (const workout of cycle.workouts) {
      const hasConditionalSingle = workout.exercises.some((exercise) => {
        const marker = `${exercise.key} ${exercise.role}`.toLowerCase();
        return (
          exercise.reps === "1" &&
          exercise.optional &&
          (marker.includes("conditional") || marker.includes("single_rehearsal"))
        );
      });
      if (hasConditionalSingle) actual.push(workout.id);
    }
  }
  assert.deepEqual(actual, [
    "v9-6-b2",
    "v9-7-b2",
    "v9-9-b2",
    "v9-11-b2",
    "v9-11-b4",
  ]);
});


test("V9-10 has four mandatory bench sets and no conditional single", () => {
  const cycle = getProgramCycle("v9", 10);
  assert.ok(cycle);
  const primary = cycle.workouts.flatMap((workout) =>
    workout.exercises.filter(
      (exercise) =>
        !exercise.optional &&
        exercise.role.includes("primary") &&
        /жим|bench/i.test(exercise.name),
    ),
  );
  assert.equal(primary.reduce((sum, exercise) => sum + Number(exercise.sets), 0), 4);
  assert.ok(primary.every((exercise) => exercise.reps !== "1"));
});


test("V9-12 contains only a light primer and no conditional heavy single", () => {
  const b4 = getProgramWorkout("v9", 12, "B4");
  assert.ok(b4);
  const primers = b4.exercises.filter((exercise) => exercise.role === "primer_single");
  assert.equal(primers.length, 3);
  assert.deepEqual(
    primers.map((exercise) => exercise.percent?.min),
    [60, 67.5, 72.5],
  );
  assert.ok(primers.every((exercise) => exercise.optional === false));
  assert.ok(primers.every((exercise) => (exercise.targetRpe?.max ?? 10) <= 6));
});


test("V9-13 requires one of two mutually exclusive branches and defaults to the triple", () => {
  const b2 = getProgramWorkout("v9", 13, "B2");
  assert.ok(b2);
  assert.equal(b2.branches.length, 2);
  assert.deepEqual(
    b2.branches.map(({ id, default: isDefault }) => [id, isDefault]),
    [
      ["triple", true],
      ["direct_1rm", false],
    ],
  );
  const direct = b2.branches.find((branch) => branch.id === "direct_1rm");
  assert.ok(direct);
  assert.equal(
    (direct.warmup as { universalLadderDefined?: boolean } | undefined)
      ?.universalLadderDefined,
    false,
  );
});
