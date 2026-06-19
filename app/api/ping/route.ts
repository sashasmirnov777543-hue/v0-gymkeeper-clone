import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

// Лёгкий маршрут для "пробуждения" базы: внешний планировщик
// (например, cron-job.org или UptimeRobot) дёргает его по расписанию,
// чтобы бесплатная база Neon не засыпала.
// Отвечает быстро и не требует авторизации.
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await pool.query("SELECT 1")
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    )
  }
}
