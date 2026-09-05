import type { ProgramDefinition, ProgramValidationResult } from "./types.ts";

/** Validate prescriptions, not a fictional physiological RPE prediction. */
export function validateProgram(p: ProgramDefinition): ProgramValidationResult {
  const errors: string[] = [];
  const all = p.cycles.flatMap((c) => c.workouts);
  const exercises = all.flatMap((w) => [
    ...w.exercises,
    ...w.branches.flatMap((b) => b.exercises ?? []),
  ]);
  if (p.version !== "h2-v9-4.0" || p.source.revision !== "3.0")
    errors.push("Wrong active revision");
  if (
    p.durationDays !== 176 ||
    p.cycleLengthDays !== 8 ||
    p.cycles.length !== 22
  )
    errors.push("Expected 176 days in 22 eight-day cycles");
  if (
    p.cycles.filter((c) => c.block === "h2").length !== 9 ||
    p.cycles.filter((c) => c.block === "v9").length !== 13
  )
    errors.push("Wrong block counts");
  if (
    all.length !== 88 ||
    all.filter((w) => w.kind === "strength").length !== 44
  )
    errors.push("Expected 88 day cards / 44 gym sessions");
  if (p.clearanceLevels?.length)
    errors.push("Revision 3.0 has no universal medical percentage levels");
  const ids = new Set<string>();
  const controls: number[] = [];
  p.cycles.forEach((c, index) => {
    if (c.dayOffset !== index * 8) errors.push(`${c.id}: wrong day offset`);
    if (c.workouts.length !== 4)
      errors.push(`${c.id}: expected four day cards`);
    if (c.checkpoint) controls.push(c.dayOffset + 4);
    c.workouts.forEach((w, i) => {
      if (w.slot !== ["B1", "B2", "B3", "B4"][i] || w.day !== [3, 4, 7, 8][i])
        errors.push(`${w.id}: wrong slot`);
      if (ids.has(w.id)) errors.push(`${w.id}: duplicate workout`);
      ids.add(w.id);
      if (w.kind === "cardio") {
        if (!w.duration || !w.cardio || w.duration.min !== w.duration.max)
          errors.push(`${w.id}: exact total cardio time required`);
        const total =
          (w.cardio?.warmupMinutes ?? 0) +
          (w.cardio?.mainMinutes?.min ?? 0) +
          (w.cardio?.cooldownMinutes ?? 0);
        if (total !== w.duration?.min)
          errors.push(`${w.id}: phases must add up to total`);
        if (w.exercises.some((e) => e.role !== "rehab" || !e.optional))
          errors.push(`${w.id}: support must be optional`);
      }
      if (
        w.exercises.some(
          (e) => e.role.includes("single") || e.role === "direct_1rm",
        )
      )
        errors.push(`${w.id}: no mandatory singles in the main plan`);
      if (w.isRestDay && (w.duration?.max !== 0 || w.exercises.length !== 0))
        errors.push(`${w.id}: rest means zero cardio and support`);
      for (const branch of w.branches) {
        if (branch.id === "direct_1rm" && branch.default)
          errors.push(`${w.id}: maximum test must not be default`);
      }
    });
  });
  if (String(controls) !== "4,36,68,108,156,172")
    errors.push("Wrong control days");
  for (const e of exercises) {
    if (ids.has(e.id)) errors.push(`${e.id}: duplicate exercise`);
    ids.add(e.id);
    if (!/^\d+$/.test(e.sets) || Number(e.sets) < 1 || Number(e.sets) > 10)
      errors.push(`${e.id}: invalid set count`);
    if (
      !e.reps ||
      !e.name ||
      e.restSeconds == null ||
      e.restSeconds < 30 ||
      e.restSeconds > 600
    )
      errors.push(`${e.id}: missing prescription/rest`);
    for (const field of [e.exampleKg, e.percent, e.targetRpe, e.targetRir]) {
      if (
        field &&
        [field.min, field.max].some(
          (n) => n != null && (!Number.isFinite(n) || n < 0),
        )
      )
        errors.push(`${e.id}: invalid numeric range`);
      if (field?.min != null && field.max != null && field.min > field.max)
        errors.push(`${e.id}: inverted range`);
    }
    if (
      e.role !== "direct_1rm" &&
      e.targetRpe?.max != null &&
      e.targetRpe.max > 8
    )
      errors.push(`${e.id}: ordinary RPE ceiling exceeded`);
    if (e.afterControlLight && (e.targetRpe?.max ?? 10) > 6)
      errors.push(`${e.id}: control backoff must be light`);
    if (e.role === "rehab" && !e.excludeFromTonnage)
      errors.push(`${e.id}: support excluded from tonnage`);
  }
  const rest = all.find((w) => w.id === "v9-13-b1");
  if (!rest?.isRestDay) errors.push("Day 171 must be a rest day");
  return {
    valid: errors.length === 0,
    errors,
    counts: {
      cycles: p.cycles.length,
      workouts: all.length,
      exercises: exercises.length,
    },
  };
}
