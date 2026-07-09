import { pool } from "./index"

let migrationPromise: Promise<void> | null = null

async function runMigrations(): Promise<void> {
  // В проекте нет отдельного раннера миграций (схема пушится извне),
  // поэтому недостающие колонки добавляем идемпотентно во время выполнения.
  await pool.query(
    "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS tempo text",
  )
  // Кардио: заполняемые скорость и сопротивление тренажёра
  await pool.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_speed text",
  )
  await pool.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_resistance text",
  )
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
  )`)
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
      migrationPromise = null
      throw err
    })
  }
  return migrationPromise
}
