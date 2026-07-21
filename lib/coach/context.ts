import { H2_V9_PROGRAM } from "../program/index.ts";
import type { CoachRuntimeContext } from "./types.ts";

function range(value: { min: number | null; max: number | null } | null, suffix: string) {
  if (!value) return "";
  if (value.min == null && value.max == null) return "";
  if (value.min === value.max) return `${value.min}${suffix}`;
  return `${value.min ?? "?"}–${value.max ?? "?"}${suffix}`;
}

const PROGRAM_DIGEST = H2_V9_PROGRAM.cycles.map((cycle) => ({
  id: cycle.id,
  name: cycle.name,
  objective: cycle.objective,
  checkpoint: cycle.checkpoint,
  workouts: cycle.workouts.map((workout) => ({
    id: workout.id,
    day: workout.day,
    kind: workout.kind,
    title: workout.title,
    duration: workout.duration,
    cardio: workout.cardio,
    warmup: workout.warmupLevel,
    prescription: workout.exercises.map((exercise) =>
      [
        exercise.name,
        `${exercise.sets}×${exercise.reps}`,
        range(exercise.percent, "% RMref"),
        range(exercise.targetRpe, " RPE"),
        range(exercise.targetRir, " RIR"),
        exercise.optional ? "условно" : "",
        exercise.condition ? exercise.condition.slice(0, 260) : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ),
    branches: workout.branches.map((branch) => ({
      id: branch.id,
      default: branch.default,
      name: branch.name,
      conditions: branch.conditions,
      exercises: branch.exercises?.map((exercise) =>
        [
          exercise.name,
          `${exercise.sets}×${exercise.reps}`,
          range(exercise.targetRpe, " RPE"),
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    })),
  })),
}));

export function buildCoachProgramContext(
  runtime: CoachRuntimeContext,
): string {
  const currentCycle = PROGRAM_DIGEST.find(
    (cycle) =>
      cycle.id === `${runtime.currentBlock ?? "none"}-${runtime.currentCycle ?? 0}`,
  );
  return JSON.stringify({
    contextType: "trusted_application_context",
    currentState: runtime,
    currentCycle,
    canonicalProgram: {
      version: H2_V9_PROGRAM.version,
      durationDays: H2_V9_PROGRAM.durationDays,
      defaultRmrefKg: H2_V9_PROGRAM.defaultRmrefKg,
      cycles: PROGRAM_DIGEST,
    },
  });
}
