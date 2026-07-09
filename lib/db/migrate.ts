import { pool } from "./index";

let migrationPromise: Promise<void> | null = null;

async function runMigrations(): Promise<void> {
  // В проекте нет отдельного раннера миграций (схема пушится извне),
  // поэтому недостающие колонки добавляем идемпотентно во время выполнения.
  await pool.query(
    "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS tempo text",
  );
  // Кардио: заполняемые скорость и сопротивление тренажёра
  await pool.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_speed text",
  );
  await pool.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_resistance text",
  );
  for (const sql of [
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sleep_minutes integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sleep_quality integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS morning_pulse_delta integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shoulder_pain integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS back_pain integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS energy integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS readiness_level text",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_rpe integer",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_talk_test text",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_symptoms text",
    "ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS velocity text",
    "ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS sticking_point text",
  ])
    await pool.query(sql);
  await pool.query(`CREATE TABLE IF NOT EXISTS tm_recalc_events (
    session_id integer PRIMARY KEY,
    target_macro integer NOT NULL,
    old_tm numeric,
    new_tm numeric NOT NULL,
    amrap_weight numeric NOT NULL,
    amrap_reps integer NOT NULL,
    e1rm numeric NOT NULL,
    updated_exercises integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sync_ops (
    operation_id text PRIMARY KEY,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  // Сначала безопасно закрываем возможные старые дубли, затем на уровне БД
  // запрещаем гонку двух активных сессий одной тренировки.
  await pool.query(`WITH duplicates AS (
    SELECT id,
           row_number() OVER (PARTITION BY workout_id ORDER BY started_at, id) AS position
    FROM sessions
    WHERE status = 'active'
  )
  UPDATE sessions
  SET status = 'cancelled', finished_at = COALESCE(finished_at, now())
  FROM duplicates
  WHERE sessions.id = duplicates.id AND duplicates.position > 1`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_per_workout
    ON sessions (workout_id) WHERE status = 'active'`);
}

/**
 * Гарантирует, что в БД есть недавно добавленные колонки (напр. workout_exercises.tempo,
 * sessions.cardio_speed/cardio_resistance).
 * Выполняется максимум один раз на инстанс сервера; при ошибке сбрасывает
 * кэш, чтобы повторить на следующем запросе.
 */
export function ensureSchema(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}
