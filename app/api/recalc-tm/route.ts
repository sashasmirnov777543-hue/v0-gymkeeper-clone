// ВРЕМЕННЫЙ маршрут: одноразовый повторный пересчёт ТМ по последнему AMRAP.
// Удалить после использования.
import { and, desc, eq, ilike } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loggedSets, sessions, workoutExercises } from "@/lib/db/schema"
import { applyAmrapTmRecalc } from "@/lib/tm-recalc"

export const dynamic = "force-dynamic"

export async function GET() {
  const rows = await db
    .select({ sessionId: sessions.id })
    .from(loggedSets)
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .where(
      and(
        eq(sessions.status, "completed"),
        ilike(workoutExercises.name, "%AMRAP%"),
      ),
    )
    .orderBy(desc(sessions.finishedAt))
    .limit(1)

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "AMRAP-сессия не найдена" },
      { status: 404 },
    )
  }

  const result = await applyAmrapTmRecalc(rows[0].sessionId)

  return NextResponse.json({ ok: Boolean(result), result })
}
