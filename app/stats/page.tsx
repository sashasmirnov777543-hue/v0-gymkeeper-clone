import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { loggedSets, sessions, workoutExercises } from "@/lib/db/schema"
import { BottomNav } from "@/components/bottom-nav"
import { StatsView } from "@/components/stats-view"

export const dynamic = "force-dynamic"

export default async function StatsPage() {
  const rows = await db
    .select({
      exerciseName: workoutExercises.name,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
      rir: loggedSets.rir,
      startedAt: sessions.startedAt,
      sessionId: loggedSets.sessionId,
    })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .where(eq(sessions.status, "completed"))
    .orderBy(asc(sessions.startedAt))

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-24">
      <header className="px-4 pb-2 pt-6">
        <h1 className="text-xl font-bold">Статистика</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Прогресс по упражнениям: расчётный 1ПМ, лучший вес и тоннаж
        </p>
      </header>

      <StatsView
        rows={rows.map((r) => ({
          exerciseName: r.exerciseName,
          weight: r.weight != null ? Number.parseFloat(r.weight) : null,
          reps: r.reps,
          rir: r.rir,
          date: r.startedAt.toISOString(),
          sessionId: r.sessionId,
        }))}
      />

      <BottomNav />
    </main>
  )
}
