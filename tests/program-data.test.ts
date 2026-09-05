import assert from "node:assert/strict";
import test from "node:test";
import {
  H2_V9_PROGRAM,
  H2_V9_PROGRAM_VALIDATION,
  getProgramCycle,
  getProgramWorkout,
  listProgramWorkouts,
  type ProgramExercise,
} from "../lib/program/legacy-v21.ts";

/** Роли, которые редакция 2.0 считает работой в соревновательном жиме. */
const BENCH_ROLES = new Set([
  "primary_bench",
  "primary_backoff",
  "calibration",
  "test_triple",
  "technique_press",
  "primer_single",
]);

function gymDayExercises(cycleId: string): ProgramExercise[] {
  const cycle = H2_V9_PROGRAM.cycles.find((item) => item.id === cycleId);
  assert.ok(cycle, cycleId);
  return cycle.workouts
    .filter((workout) => workout.kind === "strength")
    .flatMap((workout) => workout.exercises);
}

/** Подсобка зального дня — всё, что не соревновательный жим и не условный сингл. */
function accessoryCount(cycleId: string): number {
  return gymDayExercises(cycleId).filter(
    (exercise) =>
      !BENCH_ROLES.has(exercise.role) && exercise.role !== "conditional_single",
  ).length;
}

test("canonical program has 176 days, 22 cycles and 88 B-slots", () => {
  assert.equal(H2_V9_PROGRAM.version, "h2-v9-3.0");
  assert.equal(H2_V9_PROGRAM.durationDays, 176);
  assert.equal(H2_V9_PROGRAM.cycleLengthDays, 8);
  assert.equal(H2_V9_PROGRAM.defaultRmrefKg, 115);
  assert.equal(H2_V9_PROGRAM.cycles.length, 22);
  assert.equal(
    H2_V9_PROGRAM.cycles.filter((cycle) => cycle.block === "h2").length,
    9,
  );
  assert.equal(
    H2_V9_PROGRAM.cycles.filter((cycle) => cycle.block === "v9").length,
    13,
  );
  assert.equal(listProgramWorkouts().length, 88);
  // 640 плановых упражнений; ветка прямого 1ПМ добавляет 641-е.
  // Больше, чем в редакции 2.0: ступени реаб-блока с Ц7 добавляют прон. Y,
  // а с Ц10 — ещё и серратус-пуш.
  assert.equal(H2_V9_PROGRAM_VALIDATION.counts.exercises, 640);
  const branchExercises = listProgramWorkouts().flatMap((workout) =>
    workout.branches.flatMap((branch) => branch.exercises ?? []),
  );
  assert.equal(branchExercises.length, 1);
  assert.equal(
    H2_V9_PROGRAM_VALIDATION.counts.exercises + branchExercises.length,
    641,
  );
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

test("exactly six cycles carry a checkpoint", () => {
  assert.deepEqual(
    H2_V9_PROGRAM.cycles
      .filter((cycle) => cycle.checkpoint)
      .map((cycle) => cycle.id),
    ["h2-1", "h2-5", "h2-9", "v9-5", "v9-11", "v9-13"],
  );
  assert.equal(
    getProgramCycle("h2", 1)?.checkpoint?.type,
    "baseline_calibration_triple",
  );
  assert.equal(
    getProgramCycle("v9", 13)?.checkpoint?.type,
    "mutually_exclusive_branch_test",
  );
});

test("H2-5 is a calibration checkpoint with a trimmed accessory list", () => {
  const cycle = getProgramCycle("h2", 5);
  assert.ok(cycle);
  assert.equal(cycle.checkpoint?.id, "h2-5-checkpoint");
  assert.equal(cycle.checkpoint?.type, "calibration_triple");

  const b2 = getProgramWorkout("h2", 5, "B2");
  const b4 = getProgramWorkout("h2", 5, "B4");
  assert.ok(b2);
  assert.ok(b4);

  const calibration = b2.exercises.find(
    (exercise) => exercise.role === "calibration",
  );
  assert.ok(
    calibration,
    "H2-5 B2 must open with the standardized calibration triple",
  );
  assert.equal(calibration.sets, "1");
  assert.equal(calibration.reps, "3");
  assert.deepEqual(calibration.targetRpe, { min: 8, max: 8 });
  assert.equal(calibration.optional, false);

  // Разгрузка больше не отменяет жим: он остаётся в обоих зальных днях.
  assert.ok(b2.exercises.some((exercise) => exercise.role === "primary_bench"));
  assert.ok(b4.exercises.some((exercise) => exercise.role === "primary_bench"));
  assert.ok(
    [...b2.exercises, ...b4.exercises]
      .filter((exercise) => exercise.role === "primary_bench")
      .every((exercise) => (exercise.percent?.max ?? 100) <= 65),
    "deload bench stays light",
  );

  // Отличие разгрузки от рабочего цикла — урезанная подсобка, а не выброшенный жим.
  assert.ok(
    accessoryCount("h2-5") < accessoryCount("h2-4"),
    `h2-5 accessories ${accessoryCount("h2-5")} must be below h2-4 ${accessoryCount("h2-4")}`,
  );
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
          (marker.includes("conditional") ||
            marker.includes("single_rehearsal"))
        );
      });
      if (hasConditionalSingle) actual.push(workout.id);
    }
  }
  assert.deepEqual(actual, ["v9-8-b2", "v9-10-b2", "v9-12-b2"]);
  // Сингл Ц21 привязан к ветке теста, а не только к уровню допуска:
  // при тесте-тройке он не выполняется вовсе.
  const conditions = actual.map(
    (id) =>
      listProgramWorkouts()
        .find((workout) => workout.id === id)
        ?.exercises.find((exercise) => exercise.role === "conditional_single")
        ?.condition,
  );
  assert.deepEqual(conditions, [
    "clearance_level_2_or_3_and_all_four_gates",
    "clearance_level_2_or_3_and_all_four_gates",
    "test_branch_c_and_clearance_level_3",
  ]);

  // То же самое по роли: только эти три цикла и только слот B2.
  const byRole = listProgramWorkouts().filter((workout) =>
    workout.exercises.some(
      (exercise) => exercise.role === "conditional_single",
    ),
  );
  assert.deepEqual(
    byRole.map((workout) => workout.id),
    ["v9-8-b2", "v9-10-b2", "v9-12-b2"],
  );
  assert.ok(byRole.every((workout) => workout.slot === "B2"));
});

test("V9-10 is a heavy specific-strength cycle that carries a conditional single", () => {
  const b2 = getProgramWorkout("v9", 10, "B2");
  const b4 = getProgramWorkout("v9", 10, "B4");
  assert.ok(b2);
  assert.ok(b4);

  const single = b2.exercises.find(
    (exercise) => exercise.role === "conditional_single",
  );
  assert.ok(single, "V9-10 B2 contains the conditional single");
  assert.equal(single.optional, true);
  assert.equal(single.sets, "3");
  assert.equal(single.reps, "1");
  assert.equal(single.percent?.min, 90);
  // Редакция 2.0 писала здесь 8, потому что генератор зажимал значение перед записью.
  // Настоящий расчёт от 102,5 кг (89,1% RMref) даёт 7,0 на первом сингле и 7,7 на третьем.
  assert.deepEqual(single.targetRpe, { min: 7, max: 7.7 });
  assert.ok(
    (single.targetRpe?.max ?? 9) < 8,
    "RPE больше не упирается в потолок",
  );

  const backoff = b2.exercises.find(
    (exercise) => exercise.role === "primary_backoff",
  );
  assert.ok(backoff, "the mandatory bench work in B2 is the back-off");
  assert.equal(backoff.optional, false);
  assert.equal(backoff.sets, "2");
  assert.equal(backoff.reps, "2");
  // Редакция 2.1: бэкофф тяжелее, чем в 2.0 (было 85%) — так Ц19 отличается от Ц17.
  assert.equal(backoff.percent?.min, 87.5);

  const b4Bench = b4.exercises.find(
    (exercise) => exercise.role === "primary_bench",
  );
  assert.ok(b4Bench);
  assert.equal(b4Bench.optional, false);
  assert.equal(b4Bench.sets, "3");
  assert.equal(b4Bench.reps, "2");
  assert.equal(b4Bench.percent?.min, 85);
  assert.ok(
    b4.exercises.every((exercise) => exercise.role !== "conditional_single"),
  );
});

test("V9-12 peaks on doubles and gates its single behind the direct-1RM branch", () => {
  const b2 = getProgramWorkout("v9", 12, "B2");
  const b4 = getProgramWorkout("v9", 12, "B4");
  assert.ok(b2);
  assert.ok(b4);

  // Редакция 2.0 ставила сюда сингл 107,5 кг, подписанный как 92,5%. Фактически это
  // 93,5% — выше потолка Уровня 2, и настоящий RPE 8,4, а не 8. При тесте-тройке
  // такой подход берёт самый высокий риск программы ради замера, который его
  // не проверяет, поэтому по умолчанию его больше нет.
  const single = b2.exercises.find(
    (exercise) => exercise.role === "conditional_single",
  );
  assert.ok(single, "V9-12 B2 keeps the single as the branch-C rehearsal");
  assert.equal(single.optional, true);
  assert.equal(single.sets, "1");
  assert.equal(single.reps, "1");
  assert.equal(single.percent?.min, 90);
  assert.equal(single.condition, "test_branch_c_and_clearance_level_3");
  assert.ok(
    (single.exampleKg?.min ?? 0) <= 106.375,
    "single stays under the level-2 ceiling",
  );
  assert.ok(
    (single.targetRpe?.max ?? 0) < 8,
    "single is no longer pinned to the ceiling",
  );

  // Обязательная работа цикла — двойки, а не сингл.
  const backoff = b2.exercises.find(
    (exercise) => exercise.role === "primary_backoff",
  );
  assert.ok(backoff);
  assert.equal(backoff.optional, false);
  assert.equal(backoff.sets, "3");
  assert.equal(backoff.reps, "2");
  assert.equal(backoff.percent?.min, 87.5);

  // T−4 — двойки, а не второй сингл: тройку @RPE 8 праймер-сингл не проверяет.
  const b4Bench = b4.exercises.find(
    (exercise) => exercise.role === "primary_bench",
  );
  assert.ok(b4Bench);
  assert.equal(b4Bench.sets, "2");
  assert.equal(b4Bench.reps, "2");
  assert.equal(b4Bench.percent?.min, 85);
  assert.equal(b4Bench.optional, false);
  assert.ok(
    b4.exercises.every((exercise) => exercise.role !== "conditional_single"),
  );
  assert.ok(
    b4.exercises.every((exercise) => (exercise.targetRpe?.max ?? 0) <= 8),
  );
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

test("every cycle presses the competition bench in both B2 and B4", () => {
  for (const cycle of H2_V9_PROGRAM.cycles) {
    for (const slot of ["B2", "B4"] as const) {
      const workout = cycle.workouts.find((item) => item.slot === slot);
      assert.ok(workout, `${cycle.id} ${slot}`);
      assert.ok(
        workout.exercises.some((exercise) => BENCH_ROLES.has(exercise.role)),
        `${cycle.id} ${slot} must contain competition bench work`,
      );
    }
  }
});

test("every standardized measurement is a triple at exactly RPE 8", () => {
  const measurements = listProgramWorkouts()
    .flatMap((workout) => workout.exercises)
    .filter(
      (exercise) =>
        exercise.role === "calibration" || exercise.role === "test_triple",
    );
  assert.equal(measurements.length, 6);
  for (const exercise of measurements) {
    assert.equal(exercise.reps, "3", exercise.id);
    assert.equal(exercise.sets, "1", exercise.id);
    assert.equal(exercise.targetRpe?.min, 8, exercise.id);
    assert.equal(exercise.targetRpe?.max, 8, exercise.id);
  }
});

test("no planned set is programmed above RPE 8", () => {
  const above = listProgramWorkouts()
    .flatMap((workout) => workout.exercises)
    .filter((exercise) => (exercise.targetRpe?.max ?? 0) > 8)
    .map((exercise) => `${exercise.id}=${exercise.targetRpe?.max}`);
  assert.deepEqual(above, []);
});

test("the program holds 92 working sets at or above 80% RMref, 76 of them in V9", () => {
  const dose = (cycles: typeof H2_V9_PROGRAM.cycles) =>
    cycles.reduce(
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
              const percentMin = exercise.percent?.min ?? null;
              return (
                perWorkout +
                (percentMin !== null && percentMin >= 80
                  ? Number(exercise.sets)
                  : 0)
              );
            }, 0),
          0,
        ),
      0,
    );

  const hypertrophy = dose(
    H2_V9_PROGRAM.cycles.filter((cycle) => cycle.block === "h2"),
  );
  const strength = dose(
    H2_V9_PROGRAM.cycles.filter((cycle) => cycle.block === "v9"),
  );
  // Силовой блок: 76 сетов за 104 дня = 5,1 в неделю против 4,5 в редакции 2.0.
  // Верхняя половина диапазона минимальной эффективной дозы (3–6 сетов в неделю),
  // а не середина. Прирост сознательный и небольшой; при просадке восстановления
  // первым снимается один подход с B4 циклов 12 и 13.
  assert.equal(strength, 76);
  assert.equal(hypertrophy, 16);
  assert.equal(hypertrophy + strength, 92);
});
