// Historical revision 2.1 compatibility tests only; not used by active UI.
import { ACTIVE_PROGRAM_VERSION } from "./legacy-version.ts";
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

/** Потолок самого высокого уровня допуска. Дальше него не заходит ни одна карточка. */
const MAX_CLEARANCE_CEILING_PERCENT = 100;

/** Роли, из которых складывается подпись главного жимового дня. */
const BENCH_WORK_ROLES = new Set([
  "primary_bench",
  "primary_backoff",
  "conditional_single",
  "primer_single",
]);

/** Накопление усталости на каждый следующий подход — то же значение, что в генераторе. */
const RPE_DRIFT_PER_SET = 0.35;

/** Таблица Zourdos/Helms: %1ПМ по числу повторов и RPE от 6 до 10 с шагом 0,5. */
const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
const RPE_TABLE: Readonly<Record<number, readonly number[]>> = {
  1: [86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5, 97.8, 100.0],
  2: [83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5],
  3: [81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2],
  4: [78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2],
  5: [76.2, 77.4, 78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3],
};

/** RPE первого подхода по фактическому проценту. null — ниже валидированной шкалы. */
function firstSetRpe(reps: number, actualPercent: number): number | null {
  const row = RPE_TABLE[reps];
  if (!row || actualPercent < row[0]) return null;
  for (let i = 0; i < row.length - 1; i += 1) {
    const lo = row[i];
    const hi = row[i + 1];
    if (lo !== undefined && hi !== undefined && actualPercent >= lo && actualPercent <= hi) {
      const step = RPE_STEPS[i];
      const nextStep = RPE_STEPS[i + 1];
      if (step === undefined || nextStep === undefined) return null;
      return step + ((actualPercent - lo) / (hi - lo)) * (nextStep - step);
    }
  }
  return 10;
}

/**
 * Расхождение записанного targetRpe с независимым расчётом от веса на штанге.
 * Возвращает описание проблемы или null, если всё сходится.
 */
function rpeMismatch(exercise: ProgramExercise, rmrefKg: number): string | null {
  const kg = exercise.exampleKg?.min ?? null;
  if (kg === null) return null;
  const sets = Number.parseInt(exercise.sets, 10);
  const reps = Number.parseInt(exercise.reps, 10);
  if (!Number.isFinite(sets) || !Number.isFinite(reps) || !RPE_TABLE[reps]) return null;

  const first = firstSetRpe(reps, (100 * kg) / rmrefKg);
  if (first === null) {
    return exercise.targetRpe
      ? `set sits below the validated RPE scale but carries targetRpe ${exercise.targetRpe.min}–${exercise.targetRpe.max}`
      : null;
  }
  if (!exercise.targetRpe || exercise.targetRpe.min === null || exercise.targetRpe.max === null) {
    return `set sits inside the RPE scale but carries no target`;
  }
  const expectedFirst = Math.round(first * 10) / 10;
  const expectedLast = Math.round((first + RPE_DRIFT_PER_SET * (sets - 1)) * 10) / 10;
  if (
    Math.abs(exercise.targetRpe.min - expectedFirst) > 0.06 ||
    Math.abs(exercise.targetRpe.max - expectedLast) > 0.06
  ) {
    return `targetRpe ${exercise.targetRpe.min}–${exercise.targetRpe.max} disagrees with ${expectedFirst}–${expectedLast} recomputed from ${kg} kg`;
  }
  return null;
}
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

  if (program.version !== ACTIVE_PROGRAM_VERSION) errors.push("Unexpected program version");
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
  //
  // В редакции 2.0 эта проверка не могла сработать никогда: генератор приводил
  // значение к диапазону [4, 8] ПЕРЕД записью, и валидатор читал уже зажатое число.
  // Три реальных превышения (v9-4, v9-7, v9-12) проходили её молча. Поэтому ниже
  // добавлены проверки, которые зажимом обойти нельзя: RPE сверяется с независимым
  // расчётом от фактического веса, а потолок допуска — с килограммами на штанге.
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

  // Вес на штанге не выходит за потолок самого высокого уровня допуска.
  // Подпись в процентах и округлённые килограммы — разные числа: 92,5% от 115 кг
  // это 106,375, а на сетке 2,5 кг получается 107,5, то есть 93,5%.
  const ceilingKg = (MAX_CLEARANCE_CEILING_PERCENT / 100) * program.defaultRmrefKg;
  for (const cycle of program.cycles) {
    for (const workout of cycle.workouts) {
      for (const exercise of workout.exercises) {
        const kg = exercise.exampleKg?.max ?? exercise.exampleKg?.min ?? null;
        if (kg !== null && kg > ceilingKg + 1e-9) {
          const actual = ((100 * kg) / program.defaultRmrefKg).toFixed(1);
          errors.push(
            `${exercise.id}: bar weight ${kg} kg is ${actual}% RMref, above the ${MAX_CLEARANCE_CEILING_PERCENT}% clearance ceiling`,
          );
        }
      }
    }
  }

  // Целевой RPE пересчитывается независимо — от веса на штанге, а не от подписи.
  for (const cycle of program.cycles) {
    for (const workout of cycle.workouts) {
      for (const exercise of workout.exercises) {
        const mismatch = rpeMismatch(exercise, program.defaultRmrefKg);
        if (mismatch) errors.push(`${exercise.id}: ${mismatch}`);
      }
    }
  }

  // Ни один силовой цикл не повторяет штанговую работу другого целиком.
  //
  // Именно так редакция 2.0 теряла прогрессию: Ц12 дословно повторялся в Ц15,
  // Ц13 — в Ц16, и самый тяжёлый многоповторный подход 148-го дня был легче,
  // чем на 100-й день. Сравнивается цикл целиком, а не один зальный день:
  // вводный и первый накопительный цикл законно делят топ-сет, пока растёт объём
  // во втором зальном дне.
  const seenBarbellWork = new Map<string, string>();
  for (const cycle of program.cycles) {
    if (cycle.block !== "v9") continue;
    // Контрольные точки повторяют друг друга намеренно: замер обязан быть одинаковым.
    if (cycle.checkpoint) continue;
    const signature = cycle.workouts
      .filter((workout) => workout.kind === "strength")
      .map((workout) =>
        `${workout.slot}:` +
        workout.exercises
          .filter((exercise) => BENCH_WORK_ROLES.has(exercise.role))
          .map((exercise) => `${exercise.sets}x${exercise.reps}@${exercise.exampleKg?.min ?? "rpe8"}`)
          .join(","),
      )
      .join("|");
    if (!signature) continue;
    const previous = seenBarbellWork.get(signature);
    if (previous) {
      errors.push(`${cycle.id} repeats the barbell work of ${previous} verbatim: ${signature}`);
    }
    seenBarbellWork.set(signature, cycle.id);
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
