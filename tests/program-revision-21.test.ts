import assert from "node:assert/strict";
import test from "node:test";
import {
  H2_V9_PROGRAM,
  listProgramWorkouts,
} from "../lib/program/legacy-v21.ts";
import {
  CLEARANCE_CEILING_PERCENT,
  actualPercentOfRmref,
} from "../lib/program/gates.ts";
import {
  BASELINE_CHECKPOINT,
  RMREF_MAX_STEP_KG,
  checkpointAllowsUnboundedStep,
  reviewRmrefUpdate,
} from "../lib/program/rmref.ts";

/**
 * Гарантии редакции 2.1. Каждый тест здесь закрывает конкретный дефект 2.0,
 * который проходил все проверки того времени.
 */

const RM = H2_V9_PROGRAM.defaultRmrefKg;
const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RPE_TABLE: Record<number, number[]> = {
  1: [86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5, 97.8, 100.0],
  2: [83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5],
  3: [81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2],
  4: [78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2],
  5: [76.2, 77.4, 78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3],
};

function firstSetRpe(reps: number, actualPercent: number): number | null {
  const row = RPE_TABLE[reps];
  if (!row || actualPercent < row[0]!) return null;
  for (let i = 0; i < row.length - 1; i += 1) {
    if (actualPercent >= row[i]! && actualPercent <= row[i + 1]!) {
      return (
        RPE_STEPS[i]! +
        ((actualPercent - row[i]!) / (row[i + 1]! - row[i]!)) *
          (RPE_STEPS[i + 1]! - RPE_STEPS[i]!)
      );
    }
  }
  return 10;
}

const allExercises = () =>
  listProgramWorkouts().flatMap((workout) => workout.exercises);

test("целевой RPE пересчитывается от веса на штанге, а не от подписи в процентах", () => {
  // В 2.0 rpeOf() получал номинальный процент, а kg() округлял отдельно, и они
  // никогда не сверялись: 37 упражнений расходились больше чем на 0,35 п.п.
  const mismatches: string[] = [];
  for (const exercise of allExercises()) {
    const kg = exercise.exampleKg?.min ?? null;
    const sets = Number.parseInt(exercise.sets, 10);
    const reps = Number.parseInt(exercise.reps, 10);
    if (kg === null || !RPE_TABLE[reps] || !Number.isFinite(sets)) continue;

    const first = firstSetRpe(reps, (100 * kg) / RM);
    if (first === null) continue;
    const expected = {
      min: Math.round(first * 10) / 10,
      max: Math.round((first + 0.35 * (sets - 1)) * 10) / 10,
    };
    if (
      exercise.targetRpe?.min !== expected.min ||
      exercise.targetRpe?.max !== expected.max
    ) {
      mismatches.push(
        `${exercise.id}: ${exercise.targetRpe?.min}–${exercise.targetRpe?.max} вместо ${expected.min}–${expected.max}`,
      );
    }
  }
  assert.deepEqual(mismatches, []);
});

test("ниже валидированной шкалы числовой цели нет вместо выдуманной", () => {
  // В 2.0 половина ячеек столбца RPE лежала за пределами шкалы, включая −1,2 и −4,1;
  // генератор зажимал их в 4, а текст заметки печатал незажатое значение.
  const belowScale = allExercises().filter(
    (exercise) => exercise.belowScale === true,
  );
  assert.ok(belowScale.length > 0, "лёгкие подходы в программе есть");
  for (const exercise of belowScale) {
    assert.equal(exercise.targetRpe, null, exercise.id);
    const kg = exercise.exampleKg?.min ?? 0;
    const reps = Number.parseInt(exercise.reps, 10);
    assert.ok(
      (100 * kg) / RM < RPE_TABLE[reps]![0]!,
      `${exercise.id} действительно ниже шкалы`,
    );
  }
});

test("текст заметок не расходится с записанным targetRpe", () => {
  const drift: string[] = [];
  for (const exercise of allExercises()) {
    for (const note of exercise.notes) {
      for (const match of note.matchAll(/около (\d+(?:,\d+)?)/g)) {
        const value = Number.parseFloat(match[1]!.replace(",", "."));
        const min = exercise.targetRpe?.min ?? null;
        const max = exercise.targetRpe?.max ?? null;
        if (min === null || max === null) {
          drift.push(
            `${exercise.id}: заметка обещает ${value} при отсутствии цели`,
          );
        } else if (
          Math.abs(value - min) > 0.06 &&
          Math.abs(value - max) > 0.06
        ) {
          drift.push(`${exercise.id}: заметка ${value}, цель ${min}–${max}`);
        }
      }
    }
  }
  assert.deepEqual(drift, []);
});

test("ни один вес на штанге не выходит за потолок Уровня 2", () => {
  // 92,5% от 115 кг — это 106,375. Округление вверх до 107,5 даёт 93,5%,
  // то есть выше уровня допуска. Именно так выглядел пиковый сингл в 2.0.
  const ceilingKg = (CLEARANCE_CEILING_PERCENT.level_2 / 100) * RM;
  const over = allExercises()
    .filter((exercise) => (exercise.exampleKg?.max ?? 0) > ceilingKg)
    .map((exercise) => `${exercise.id}=${exercise.exampleKg?.max}кг`);
  assert.deepEqual(over, []);
});

test("шлюз сингла считает потолок по штанге, а не по подписи", () => {
  assert.equal(actualPercentOfRmref(107.5, 115)?.toFixed(1), "93.5");
  assert.equal(actualPercentOfRmref(105, 115)?.toFixed(1), "91.3");
  assert.equal(actualPercentOfRmref(0, 115), null);
  // Подпись 92,5% и штанга 107,5 кг — разные числа, и решает второе.
  assert.ok(
    actualPercentOfRmref(107.5, 115)! > CLEARANCE_CEILING_PERCENT.level_2,
    "штанга 107,5 кг выходит за потолок Уровня 2",
  );
});

test("ни один силовой цикл не повторяет штанговую работу другого", () => {
  const roles = new Set([
    "primary_bench",
    "primary_backoff",
    "conditional_single",
    "primer_single",
  ]);
  const seen = new Map<string, string>();
  for (const cycle of H2_V9_PROGRAM.cycles) {
    if (cycle.block !== "v9" || cycle.checkpoint) continue;
    const signature = cycle.workouts
      .filter((workout) => workout.kind === "strength")
      .map(
        (workout) =>
          `${workout.slot}:` +
          workout.exercises
            .filter((exercise) => roles.has(exercise.role))
            .map((e) => `${e.sets}x${e.reps}@${e.exampleKg?.min}`)
            .join(","),
      )
      .join("|");
    const previous = seen.get(signature);
    assert.equal(previous, undefined, `${cycle.id} повторяет ${previous}`);
    seen.set(signature, cycle.id);
  }
});

test("длинная Z2-сессия стоит перед лёгким зальным днём, а не перед главным", () => {
  for (const cycle of H2_V9_PROGRAM.cycles) {
    const b1 = cycle.workouts.find((workout) => workout.slot === "B1");
    const b3 = cycle.workouts.find((workout) => workout.slot === "B3");
    assert.ok(b1 && b3, cycle.id);
    const b1Minutes = b1.duration?.max ?? 0;
    const b3Minutes = b3.duration?.max ?? 0;
    assert.notEqual(
      b1.cardio?.zone,
      "Z2",
      `${cycle.id}: Z2 не должна стоять перед B2`,
    );
    // Тест-цикл — единственное исключение: B1 перед тестом это полный отдых.
    if (cycle.id === "v9-13") continue;
    assert.ok(
      b1Minutes <= b3Minutes,
      `${cycle.id}: B1 ${b1Minutes} мин не длиннее B3 ${b3Minutes} мин`,
    );
  }
});

test("реаб-блок проходит шесть ступеней, а не стоит на месте все 176 дней", () => {
  const signatures = new Map<string, string[]>();
  for (const cycle of H2_V9_PROGRAM.cycles) {
    for (const workout of cycle.workouts) {
      if (workout.kind !== "cardio") continue;
      const signature = workout.exercises
        .map((exercise) => `${exercise.key}:${exercise.sets}x${exercise.reps}`)
        .join("|");
      const list = signatures.get(signature) ?? [];
      list.push(cycle.id);
      signatures.set(signature, list);
    }
  }
  assert.equal(signatures.size, 6, "шесть ступеней");

  // Ступень не понижается по ходу программы и держится в тейпере.
  const stageOf = (cycleIndex: number) =>
    [...signatures.values()].findIndex((cycles) =>
      cycles.includes(H2_V9_PROGRAM.cycles[cycleIndex]!.id),
    );
  for (let i = 1; i < H2_V9_PROGRAM.cycles.length; i += 1) {
    assert.ok(
      stageOf(i) >= stageOf(i - 1),
      `ступень не откатывается на цикле ${i + 1}`,
    );
  }
});

test("базовый замер задаёт RMref без коридора ±5 кг", () => {
  // В 2.0 коридор применялся ко всем шести точкам, включая первую. Ошибка в 10 кг
  // исправлялась до 68-го дня, и всё это время «72,5%» шли фактически на 79%.
  assert.equal(BASELINE_CHECKPOINT, "h2-1");
  assert.equal(checkpointAllowsUnboundedStep("h2-1"), true);
  assert.equal(checkpointAllowsUnboundedStep("h2-5"), false);

  const evidence = [
    {
      sessionId: "baseline",
      comparableTechnique: true,
      comparablePause: true,
      comparableTouchPoint: true,
      improvementConfirmed: true,
    },
  ];

  const baseline = reviewRmrefUpdate({
    checkpoint: "h2-1",
    currentRmrefKg: 115,
    proposedRmrefKg: 105,
    evidence,
  });
  assert.equal(baseline.allowed, true, baseline.reasons.join(", "));
  assert.equal(baseline.nextRmrefKg, 105);

  // На всех остальных точках коридор остаётся.
  const later = reviewRmrefUpdate({
    checkpoint: "h2-5",
    currentRmrefKg: 115,
    proposedRmrefKg: 105,
    evidence,
  });
  assert.equal(later.allowed, false);
  assert.ok(later.reasons.includes("change-exceeds-5-kg"));
  assert.equal(RMREF_MAX_STEP_KG, 5);
});

test("объём силового блока остаётся в диапазоне минимальной эффективной дозы", () => {
  const strength = H2_V9_PROGRAM.cycles
    .filter((cycle) => cycle.block === "v9")
    .reduce(
      (total, cycle) =>
        total +
        cycle.workouts.reduce(
          (perCycle, workout) =>
            perCycle +
            workout.exercises.reduce((perWorkout, exercise) => {
              if (
                exercise.role === "calibration" ||
                exercise.role === "test_triple"
              ) {
                return perWorkout + 1;
              }
              const percent = exercise.percent?.min ?? null;
              return (
                perWorkout +
                (percent !== null && percent >= 80 ? Number(exercise.sets) : 0)
              );
            }, 0),
          0,
        ),
      0,
    );
  const perWeek = (strength * 7) / 104;
  assert.ok(
    perWeek >= 3 && perWeek <= 6,
    `${perWeek.toFixed(2)} сет/нед вне диапазона 3–6`,
  );
  assert.ok(perWeek > 4.51, "доза выше редакции 2.0");
});
