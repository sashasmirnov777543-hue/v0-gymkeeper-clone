import type {
  NumericRange,
  ProgramCycle,
  ProgramDefinition,
  ProgramExercise,
  ProgramValidationResult,
  WorkoutSlot,
} from "./types.ts";

const EXPECTED_SLOTS = ["B1", "B2", "B3", "B4"] as const;
const EXPECTED_DAYS: Record<WorkoutSlot, 3 | 4 | 7 | 8> = {
  B1: 3,
  B2: 4,
  B3: 7,
  B4: 8,
};
// Редакция 2.0: шесть точек измерения (Ц1, Ц5, Ц9, Ц14, Ц20 и тест Ц22).
const CHECKPOINT_CYCLES = new Set(["h2-1", "h2-5", "h2-9", "v9-5", "v9-11", "v9-13"]);
// Редакция 2.0: условные синглы только в B2 циклов V9-8, V9-10 и V9-12.
const SINGLE_LOCATIONS = new Set(["v9-8-b2", "v9-10-b2", "v9-12-b2"]);
// Роли, которые считаются соревновательным жимом при проверке «жим в обоих зальных днях».
const BENCH_ROLES = new Set([
  "primary_bench",
  "primary_backoff",
  "calibration",
  "test_triple",
  "technique_press",
  "primer_single",
]);

function validateRange(
  value: NumericRange | null,
  label: string,
  errors: string[],
  bounds?: readonly [number, number],
) {
  if (value === null) return;
  const { min, max } = value;
  if (min !== null && !Number.isFinite(min)) errors.push(`${label}: min is invalid`);
  if (max !== null && !Number.isFinite(max)) errors.push(`${label}: max is invalid`);
  if (min !== null && max !== null && min > max) {
    errors.push(`${label}: min exceeds max`);
  }
  if (bounds) {
    if (min !== null && (min < bounds[0] || min > bounds[1])) {
      errors.push(`${label}: min is outside ${bounds[0]}–${bounds[1]}`);
    }
    if (max !== null && (max < bounds[0] || max > bounds[1])) {
      errors.push(`${label}: max is outside ${bounds[0]}–${bounds[1]}`);
    }
  }
}

function isConditionalHeavySingle(exercise: ProgramExercise): boolean {
  const marker = `${exercise.key} ${exercise.role}`.toLowerCase();
  return (
    exercise.reps.trim() === "1" &&
    exercise.optional &&
    (marker.includes("conditional") || marker.includes("single_rehearsal"))
  );
}

function fixedSetCount(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

function getCycle(program: ProgramDefinition, id: string): ProgramCycle | undefined {
  return program.cycles.find((cycle) => cycle.id === id);
}

export function validateProgram(program: ProgramDefinition): ProgramValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  let workoutCount = 0;
  let exerciseCount = 0;

  if (program.version !== "h2-v9-2.0") errors.push("Unexpected program version");
  if (program.durationDays !== 176) errors.push("Program must contain 176 days");
  if (program.cycleLengthDays !== 8) errors.push("Cycle length must be 8 days");
  if (program.defaultRmrefKg !== 115) errors.push("Default RMref must be 115 kg");
  if (program.cycles.length !== 22) errors.push("Program must contain 22 cycles");

  const h2 = program.cycles.filter((cycle) => cycle.block === "h2");
  const v9 = program.cycles.filter((cycle) => cycle.block === "v9");
  if (h2.length !== 9) errors.push("H2 must contain 9 cycles");
  if (v9.length !== 13) errors.push("V9 must contain 13 cycles");

  for (const cycle of program.cycles) {
    if (ids.has(cycle.id)) errors.push(`Duplicate id: ${cycle.id}`);
    ids.add(cycle.id);
    if (cycle.id !== `${cycle.block}-${cycle.number}`) {
      errors.push(`${cycle.id}: cycle id does not match block and number`);
    }
    if (cycle.workouts.length !== 4) errors.push(`${cycle.id}: expected 4 workouts`);
    const slots = cycle.workouts.map((workout) => workout.slot);
    if (slots.join(",") !== EXPECTED_SLOTS.join(",")) {
      errors.push(`${cycle.id}: workout slots must be B1,B2,B3,B4`);
    }
    const shouldHaveCheckpoint = CHECKPOINT_CYCLES.has(cycle.id);
    if (shouldHaveCheckpoint !== (cycle.checkpoint !== null)) {
      errors.push(`${cycle.id}: checkpoint metadata mismatch`);
    }

    for (const workout of cycle.workouts) {
      workoutCount += 1;
      if (ids.has(workout.id)) errors.push(`Duplicate id: ${workout.id}`);
      ids.add(workout.id);
      if (workout.id !== `${cycle.id}-${workout.slot.toLowerCase()}`) {
        errors.push(`${workout.id}: workout id mismatch`);
      }
      if (workout.day !== EXPECTED_DAYS[workout.slot]) {
        errors.push(`${workout.id}: wrong day for ${workout.slot}`);
      }
      if (
        workout.kind === "cardio" &&
        workout.exercises.some((exercise) => exercise.role !== "rehab")
      ) {
        errors.push(`${workout.id}: cardio may contain only rehab work`);
      }
      if (workout.kind === "strength" && workout.cardio !== null) {
        errors.push(`${workout.id}: strength workout must not contain cardio prescription`);
      }
      if (workout.duration && workout.duration.min > workout.duration.max) {
        errors.push(`${workout.id}: duration range is invalid`);
      }

      for (const exercise of workout.exercises) {
        exerciseCount += 1;
        if (ids.has(exercise.id)) errors.push(`Duplicate id: ${exercise.id}`);
        ids.add(exercise.id);
        validateRange(exercise.percent, `${exercise.id}.percent`, errors, [0, 100]);
        validateRange(exercise.exampleKg, `${exercise.id}.exampleKg`, errors, [0, 500]);
        validateRange(exercise.targetRpe, `${exercise.id}.targetRpe`, errors, [0, 10]);
        validateRange(exercise.targetRir, `${exercise.id}.targetRir`, errors, [0, 10]);
        if (isConditionalHeavySingle(exercise) && !SINGLE_LOCATIONS.has(workout.id)) {
          errors.push(`${exercise.id}: conditional heavy single is not allowed here`);
        }
      }
    }
  }

  if (workoutCount !== 88) errors.push(`Expected 88 workouts, found ${workoutCount}`);

  for (const location of SINGLE_LOCATIONS) {
    const [block, cycleNumber, slot] = location.split("-");
    const cycle = getCycle(program, `${block}-${cycleNumber}`);
    const workout = cycle?.workouts.find((item) => item.slot.toLowerCase() === slot);
    if (!workout?.exercises.some(isConditionalHeavySingle)) {
      errors.push(`${location}: missing conditional heavy single`);
    }
  }

  // Редакция 2.0: соревновательный жим присутствует в обоих зальных днях КАЖДОГО цикла.
  for (const cycle of program.cycles) {
    for (const slot of ["B2", "B4"] as const) {
      const workout = cycle.workouts.find((item) => item.slot === slot);
      const hasBench = workout?.exercises.some((exercise) =>
        BENCH_ROLES.has(exercise.role),
      );
      if (!hasBench) {
        errors.push(`${cycle.id} ${slot}: missing competition bench work`);
      }
    }
  }

  // Все шесть точек измерения снимаются одним протоколом: ровно RPE 8.
  for (const cycle of program.cycles) {
    for (const workout of cycle.workouts) {
      for (const exercise of workout.exercises) {
        if (exercise.role !== "calibration" && exercise.role !== "test_triple") continue;
        if (exercise.reps !== "3") {
          errors.push(`${exercise.id}: standardized measurement must be a triple`);
        }
        if (exercise.targetRpe?.min !== 8 || exercise.targetRpe?.max !== 8) {
          errors.push(`${exercise.id}: standardized measurement must target exactly RPE 8`);
        }
      }
    }
  }

  // Никакой плановый подход не выходит за RPE 8.
  for (const cycle of program.cycles) {
    for (const workout of cycle.workouts) {
      for (const exercise of workout.exercises) {
        if (exercise.targetRpe && exercise.targetRpe.max !== null && exercise.targetRpe.max > 8) {
          errors.push(`${exercise.id}: planned RPE ${exercise.targetRpe.max} exceeds the RPE 8 ceiling`);
        }
      }
    }
  }

  // Ни один плановый вес не превышает потолок самого высокого уровня допуска.
  for (const cycle of program.cycles) {
    for (const workout of cycle.workouts) {
      for (const exercise of workout.exercises) {
        if (exercise.percent?.max != null && exercise.percent.max > 100) {
          errors.push(`${exercise.id}: percent above 100% RMref`);
        }
      }
    }
  }

  const v913b2 = getCycle(program, "v9-13")?.workouts.find(
    (workout) => workout.slot === "B2",
  );
  if (!v913b2 || v913b2.branches.length !== 2) {
    errors.push("V9-13 B2 must contain exactly two test branches");
  } else {
    const defaults = v913b2.branches.filter((branch) => branch.default);
    if (defaults.length !== 1 || defaults[0]?.id !== "triple") {
      errors.push("V9-13 must have exactly one default branch: triple");
    }
    if (!v913b2.branches.some((branch) => branch.id === "direct_1rm")) {
      errors.push("V9-13 is missing the separate direct 1RM branch");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      cycles: program.cycles.length,
      workouts: workoutCount,
      exercises: exerciseCount,
    },
  };
}
