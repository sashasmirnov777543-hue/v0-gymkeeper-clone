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
