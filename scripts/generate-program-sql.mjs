import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "lib/program/h2-v9-v4.json");
const outputPath = join(root, "migrations/016_seed_h2_v9_v4.sql");

/**
 * Уникальные индексы workouts.program_key и workout_exercises.program_key НЕ версионированы.
 * Без префикса upsert редакции 2.0 переписал бы строки редакции 1.0 прямо на месте
 * и переподчинил бы их новым циклам. Префикс делает ключи непересекающимися.
 */
const KEY_PREFIX = "v4:";
const pk = (id) => `${KEY_PREFIX}${id}`;
const program = JSON.parse(readFileSync(sourcePath, "utf8"));

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function j(value) {
  return `${q(JSON.stringify(value))}::jsonb`;
}

function n(value) {
  return value === null || value === undefined ? "NULL" : String(value);
}

function rangeText(range, suffix = "") {
  if (!range || (range.min == null && range.max == null)) return null;
  const min = range.min;
  const max = range.max;
  if (min == null) return `≤${max}${suffix}`;
  if (max == null) return `≥${min}${suffix}`;
  return min === max ? `${min}${suffix}` : `${min}–${max}${suffix}`;
}

function weightText(exercise) {
  const percent = rangeText(exercise.percent, "% RMref");
  const example = rangeText(exercise.exampleKg, " кг");
  const rpe = rangeText(exercise.targetRpe, " RPE");
  const rir = rangeText(exercise.targetRir, " RIR");
  if (example)
    return `${example} · стартовый пример при R=${program.defaultRmrefKg}`;
  return percent ?? rpe ?? rir ?? null;
}

function restSeconds(exercise) {
  if (Number.isFinite(exercise.restSeconds)) return exercise.restSeconds;
  const marker = `${exercise.key} ${exercise.role}`.toLowerCase();
  if (
    marker.includes("single") ||
    marker.includes("test") ||
    marker.includes("calibration")
  )
    return 300;
  if (
    marker.includes("primary") ||
    /соревновательный|паузный жим|жим лёжа/.test(exercise.name.toLowerCase())
  )
    return 240;
  if (
    marker.includes("secondary") ||
    marker.includes("spoto") ||
    marker.includes("close_grip")
  )
    return 180;
  if (
    marker.includes("pull") ||
    marker.includes("row") ||
    marker.includes("upper_back")
  )
    return 150;
  if (
    marker.includes("rehab") ||
    marker.includes("face_pull") ||
    marker.includes("rotation")
  )
    return 60;
  return 90;
}

/**
 * Макроциклы редакции 2.0.
 * Гипертрофия: Ц1–Ц5 фундамент, Ц6–Ц9 накопление и мост.
 * Сила: Ц10–Ц14 накопление, Ц15–Ц20 интенсификация и специфическая сила, Ц21–Ц22 пик и тест.
 */
function macrocycle(block, cycle) {
  if (block === "h2") return cycle <= 5 ? 1 : 2;
  return cycle <= 5 ? 3 : cycle <= 11 ? 4 : 5;
}

const lines = [
  "-- 016: Жимовая программа, редакция 3.0. Сгенерировано из lib/program/h2-v9-v4.json.",
  "-- Идемпотентный upsert по префиксованным ключам v4:. Строки редакций 1.0, 2.0 и 2.1 и история сессий не затрагиваются.",
  "",
];

for (const [cycleIndex, cycle] of program.cycles.entries()) {
  const cycleNotes = [cycle.objective, ...(cycle.rules ?? [])]
    .filter(Boolean)
    .join("\n\n");
  lines.push(`-- ${cycle.id} ${cycle.name}`);
  lines.push(
    `INSERT INTO cycles (number, name, macrocycle, notes, sort_order, block, program_version, program_key, day_offset, checkpoint, rules) VALUES (` +
      `${cycle.number}, ${q(cycle.name)}, ${macrocycle(cycle.block, cycle.number)}, ${q(cycleNotes)}, ${cycleIndex + 1}, ${q(cycle.block)}, ${q(program.version)}, ${q(pk(cycle.id))}, ${cycle.dayOffset}, ${cycle.checkpoint ? j(cycle.checkpoint) : "NULL"}, ${j(cycle.rules ?? [])}) ` +
      `ON CONFLICT (program_version, program_key) WHERE program_key IS NOT NULL DO UPDATE SET ` +
      `number=EXCLUDED.number, name=EXCLUDED.name, macrocycle=EXCLUDED.macrocycle, notes=EXCLUDED.notes, sort_order=EXCLUDED.sort_order, block=EXCLUDED.block, day_offset=EXCLUDED.day_offset, checkpoint=EXCLUDED.checkpoint, rules=EXCLUDED.rules;`,
  );

  for (const [workoutIndex, workout] of cycle.workouts.entries()) {
    const cardioText = workout.cardio?.prescriptionText ?? null;
    lines.push(
      `INSERT INTO workouts (cycle_id, label, title, notes, sort_order, kind, cardio_zone, cardio_minutes, program_key, day_in_cycle, warmup_level, prescription, branches) VALUES (` +
        `(SELECT id FROM cycles WHERE program_version=${q(program.version)} AND program_key=${q(pk(cycle.id))}), ${q(workout.slot)}, ${q(workout.title)}, ${q((workout.notes ?? []).join("\n"))}, ${workoutIndex + 1}, ${q(workout.kind)}, ${q(workout.cardio?.zone ?? null)}, ${q(cardioText)}, ${q(pk(workout.id))}, ${workout.day}, ${q(workout.warmupLevel)}, ${j(workout)}, ${j(workout.branches ?? [])}) ` +
        `ON CONFLICT (program_key) WHERE program_key IS NOT NULL DO UPDATE SET ` +
        `cycle_id=EXCLUDED.cycle_id, label=EXCLUDED.label, title=EXCLUDED.title, notes=EXCLUDED.notes, sort_order=EXCLUDED.sort_order, kind=EXCLUDED.kind, cardio_zone=EXCLUDED.cardio_zone, cardio_minutes=EXCLUDED.cardio_minutes, day_in_cycle=EXCLUDED.day_in_cycle, warmup_level=EXCLUDED.warmup_level, prescription=EXCLUDED.prescription, branches=EXCLUDED.branches;`,
    );

    const seededExercises = [
      ...workout.exercises,
      ...(workout.branches ?? []).flatMap((branch) =>
        (branch.exercises ?? []).map((exercise) => ({
          ...exercise,
          optional: true,
          condition:
            exercise.condition ??
            (branch.conditions ?? []).join(" | ") ??
            `Ветка ${branch.id}`,
          notes: [...(exercise.notes ?? []), `Ветка теста: ${branch.id}`],
        })),
      ),
    ];
    for (const [exerciseIndex, exercise] of seededExercises.entries()) {
      const comments = [exercise.condition, ...(exercise.notes ?? [])]
        .filter(Boolean)
        .join("\n");
      const targetRirMin = Number.isInteger(exercise.targetRir?.min)
        ? exercise.targetRir.min
        : null;
      const targetRirMax = Number.isInteger(exercise.targetRir?.max)
        ? exercise.targetRir.max
        : null;
      lines.push(
        `INSERT INTO workout_exercises (workout_id, sort_order, name, weight_text, pct_of_tm, target_reps, target_sets, target_rir_min, target_rir_max, comment, rest_seconds, program_key, role, pct_min, pct_max, example_kg_min, example_kg_max, target_rpe_min, target_rpe_max, is_optional, condition_code, exclude_from_tonnage, prescription) VALUES (` +
          `(SELECT id FROM workouts WHERE program_key=${q(pk(workout.id))}), ${exerciseIndex + 1}, ${q(exercise.name)}, ${q(weightText(exercise))}, ${exercise.percent?.min === exercise.percent?.max ? n(exercise.percent?.min) : "NULL"}, ${q(exercise.reps)}, ${q(exercise.sets)}, ${n(targetRirMin)}, ${n(targetRirMax)}, ${q(comments)}, ${restSeconds(exercise)}, ${q(pk(exercise.id))}, ${q(exercise.role)}, ${n(exercise.percent?.min)}, ${n(exercise.percent?.max)}, ${n(exercise.exampleKg?.min)}, ${n(exercise.exampleKg?.max)}, ${n(exercise.targetRpe?.min)}, ${n(exercise.targetRpe?.max)}, ${exercise.optional ? "true" : "false"}, ${q(exercise.condition)}, ${exercise.excludeFromTonnage ? "true" : "false"}, ${j(exercise)}) ` +
          `ON CONFLICT (program_key) WHERE program_key IS NOT NULL DO UPDATE SET ` +
          `workout_id=EXCLUDED.workout_id, sort_order=EXCLUDED.sort_order, name=EXCLUDED.name, weight_text=EXCLUDED.weight_text, pct_of_tm=EXCLUDED.pct_of_tm, target_reps=EXCLUDED.target_reps, target_sets=EXCLUDED.target_sets, target_rir_min=EXCLUDED.target_rir_min, target_rir_max=EXCLUDED.target_rir_max, comment=EXCLUDED.comment, rest_seconds=EXCLUDED.rest_seconds, role=EXCLUDED.role, pct_min=EXCLUDED.pct_min, pct_max=EXCLUDED.pct_max, example_kg_min=EXCLUDED.example_kg_min, example_kg_max=EXCLUDED.example_kg_max, target_rpe_min=EXCLUDED.target_rpe_min, target_rpe_max=EXCLUDED.target_rpe_max, is_optional=EXCLUDED.is_optional, condition_code=EXCLUDED.condition_code, exclude_from_tonnage=EXCLUDED.exclude_from_tonnage, prescription=EXCLUDED.prescription;`,
      );
    }
  }
  lines.push("");
}

lines.push(
  `UPDATE app_settings SET value=${q(program.version)} WHERE key='active_program_version';`,
  `UPDATE program_state SET program_version=${q(program.version)}, updated_at=now() WHERE profile_key='primary';`,
  "",
);

writeFileSync(outputPath, `${lines.join("\n")}\n`);
console.log(`Generated ${outputPath}`);
