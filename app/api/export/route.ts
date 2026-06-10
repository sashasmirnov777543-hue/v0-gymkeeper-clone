import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema"

export const dynamic = "force-dynamic"

/** Экспорт всей истории тренировок в CSV (для тренера / резервной копии). */
export async function GET() {
  const rows = await db
    .select({
      date: sessions.startedAt,
      cycleNumber: cycles.number,
      cycleName: cycles.name,
      workoutTitle: workouts.title,
      exercise: workoutExercises.name,
      setNumber: loggedSets.setNumber,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
      rir: loggedSets.rir,
      notes: sessions.notes,
    })
    .from(loggedSets)
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .where(eq(sessions.status, "completed"))
    .orderBy(asc(sessions.startedAt), asc(loggedSets.id))

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header =
    "Дата;Цикл;Фаза;Тренировка;Упражнение;Подход;Вес (кг);Повторы;RIR;Заметка"
  const lines = rows.map((r) =>
    [
      r.date.toISOString().slice(0, 10),
      r.cycleNumber,
      esc(r.cycleName),
      esc(r.workoutTitle),
      esc(r.exercise),
      r.setNumber,
      r.weight ?? "",
      r.reps ?? "",
      r.rir ?? "",
      esc(r.notes),
    ].join(";"),
  )

  // BOM, чтобы Excel корректно открыл кириллицу
  const csv = "\uFEFF" + [header, ...lines].join("\n")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gym-history-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
