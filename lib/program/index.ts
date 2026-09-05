import rawProgram from "./h2-v9-v4.json" with { type: "json" };
import type {
  ProgramBlock,
  ProgramCycle,
  ProgramDefinition,
  ProgramExercise,
  ProgramWorkout,
  WorkoutSlot,
} from "./types.ts";
import { validateProgram } from "./validate.ts";

export const H2_V9_PROGRAM = rawProgram as unknown as ProgramDefinition;
export const H2_V9_PROGRAM_VALIDATION = validateProgram(H2_V9_PROGRAM);

if (!H2_V9_PROGRAM_VALIDATION.valid) {
  throw new Error(
    `Invalid H2→V9 program data:\n${H2_V9_PROGRAM_VALIDATION.errors.join("\n")}`,
  );
}

export function getProgramCycle(
  block: ProgramBlock,
  number: number,
): ProgramCycle | null {
  return (
    H2_V9_PROGRAM.cycles.find(
      (cycle) => cycle.block === block && cycle.number === number,
    ) ?? null
  );
}

export function getProgramWorkout(
  block: ProgramBlock,
  cycleNumber: number,
  slot: WorkoutSlot,
): ProgramWorkout | null {
  return (
    getProgramCycle(block, cycleNumber)?.workouts.find(
      (workout) => workout.slot === slot,
    ) ?? null
  );
}

export function getProgramExercise(exerciseId: string): ProgramExercise | null {
  for (const cycle of H2_V9_PROGRAM.cycles) {
    for (const workout of cycle.workouts) {
      const exercise = workout.exercises.find((item) => item.id === exerciseId);
      if (exercise) return exercise;
      for (const branch of workout.branches) {
        const branchExercise = branch.exercises?.find(
          (item) => item.id === exerciseId,
        );
        if (branchExercise) return branchExercise;
      }
    }
  }
  return null;
}

export function listProgramWorkouts(): ProgramWorkout[] {
  return H2_V9_PROGRAM.cycles.flatMap((cycle) => cycle.workouts);
}

export type {
  CardioPrescription,
  MinuteRange,
  NumericRange,
  ProgramBlock,
  ProgramCheckpoint,
  ProgramCycle,
  ProgramDefinition,
  ProgramExercise,
  ProgramTestBranch,
  ProgramValidationResult,
  ProgramWorkout,
  WorkoutKind,
  WorkoutSlot,
} from "./types.ts";
