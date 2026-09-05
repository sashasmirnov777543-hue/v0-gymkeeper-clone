import {
  comparableTripleIndex,
  techniqueClean,
  type EffortSet,
} from "./program/policy.ts";
export function isE1rmExercise(name: string): boolean {
  return /жим.*л[её]жа|жим.*пауз|соревновательн.*жим|паузн.*жим|спото|spoto|жим.*узк|узк.*жим|close.?grip/.test(
    name.toLocaleLowerCase("ru-RU"),
  );
}
export function e1rmForStats(
  name: string,
  weight: number,
  reps: number,
  evidence?: Partial<EffortSet>,
): number | null {
  if (
    !isE1rmExercise(name) ||
    !evidence ||
    evidence.isWarmup ||
    !["calibration", "test_triple"].includes(evidence.role ?? "")
  )
    return null;
  const comparable =
    techniqueClean({ workoutExerciseId: 0, ...evidence }) &&
    evidence.pauseQuality === "clean" &&
    evidence.touchPoint === "stable" &&
    evidence.trajectoryQuality === "clean";
  const result = comparableTripleIndex(
    weight,
    reps,
    evidence.rpe ?? NaN,
    comparable,
  );
  return result == null ? null : Math.round(result * 10) / 10;
}
