import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// ВАЖНО: без таймаутов соединение с недоступной (например, "уснувшей" на
// бесплатном тарифе Neon) базой может ждать ответа практически бесконечно —
// именно из-за этого главная страница висела в "вечной загрузке".
// Теперь, если база недоступна, запрос быстро упадёт с понятной ошибкой,
// которую перехватит app/error.tsx.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // максимум ждём подключение 10 секунд, иначе — ошибка
  connectionTimeoutMillis: 10_000,
  // закрываем простаивающие соединения (важно для serverless и засыпающей базы)
  idleTimeoutMillis: 10_000,
  // в serverless-окружении не держим большой пул
  max: 5,
})

export const db = drizzle(pool, { schema })
