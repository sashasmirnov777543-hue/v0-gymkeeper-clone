import Link from "next/link"
import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  cycles,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema"
import { startSession } from "@/app/actions/workout"
import { BottomNav } from "@/components/bottom-nav"
import { ArrowLeft, Play } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workoutId = Number.parseInt(id, 10)
  if (Number.isNaN(workoutId)) notFound()

  const [workout] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1)
  if (!workout) notFound()

  const [[cycle], exercises, active] = await Promise.all([
    db.select().from(cycles).where(eq(cycles.id, workout.cycleId)).limit(1),
    db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .orderBy(asc(workoutExercises.sortOrder)),
    db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.workoutId, workoutId), eq(sessions.status, "active")),
      )
      .limit(1),
  ])

  const startAction = startSession.bind(null, workoutId)

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-4">
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Программа
          </Link>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Цикл {cycle?.number} · {cycle?.name}
          </p>
          <h1 className="mt-1 text-balance text-xl font-bold tracking-tight">
            {workout.title}
          </h1>
          {workout.notes && (
            <p className="mt-1 text-sm text-muted-foreground">{workout.notes}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        <ul className="flex flex-col gap-2">
          {exercises.map((ex, i) => (
            <li
              key={ex.id}
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">
                    <span className="font-mono text-sm text-muted-foreground">
                      {i + 1}.{" "}
                    </span>
                    {ex.name}
                  </p>
                  {ex.weightText && (
                    <p className="mt-0.5 font-mono text-sm text-primary">
                      {ex.weightText}
                    </p>
                  )}
                </div>
                {(ex.targetReps || ex.targetSets) && (
                  <p className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-sm text-secondary-foreground">
                    {ex.targetReps ?? "—"}
                    {ex.targetSets ? ` × ${ex.targetSets}` : ""}
                  </p>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {ex.targetRirMin != null && (
                  <span className="text-xs font-medium text-warning">
                    Цель RIR{" "}
                    {ex.targetRirMin === ex.targetRirMax
                      ? ex.targetRirMin
                      : `${ex.targetRirMin}–${ex.targetRirMax}`}
                  </span>
                )}
                {ex.comment && (
                  <span className="text-pretty text-xs leading-relaxed text-muted-foreground">
                    {ex.comment}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {cycle?.notes && (
          <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            {cycle.notes}
          </p>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-16 z-40">
        <div className="mx-auto max-w-lg px-4 pb-2">
          <form action={startAction}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
            >
              <Play className="size-5" aria-hidden="true" />
              {active.length > 0
                ? "Продолжить тренировку"
                : "Начать тренировку"}
            </button>
          </form>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
