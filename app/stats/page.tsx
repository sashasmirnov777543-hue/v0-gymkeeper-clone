import { asc, eq } from "drizzle-orm"
import { Download } from "lucide-react"
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
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-6">
        <div>
          <h1 className="text-xl font-bold">Статистика</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Прогресс по упражнениям: расчётный 1ПМ, лучший вес и тоннаж
          </p>
        </div>
        <a
          href="/api/export"
          download
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Download className="size-3.5" aria-hidden="true" />
          CSV
        </a>
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
