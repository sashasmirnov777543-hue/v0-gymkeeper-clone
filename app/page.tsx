import Link from "next/link"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appSettings, cycles, workouts, sessions } from "@/lib/db/schema"
import { BottomNav } from "@/components/bottom-nav"
import { Bike, ChevronRight, Dumbbell, Flame } from "lucide-react"

export const dynamic = "force-dynamic"

const MACRO_TITLES: Record<number, string> = {
  1: "Макроцикл 1 — Объёмная база + проход середины",
  2: "Макроцикл 2 — Тяжёлые веса и кластеры",
  3: "Макроцикл 3 — Реализация + пик",
}

export default async function HomePage() {
  const [allCycles, allWorkouts, settingsRows, activeSessions, doneSessions] =
    await Promise.all([
      db.select().from(cycles).orderBy(asc(cycles.sortOrder)),
      db.select().from(workouts).orderBy(asc(workouts.sortOrder)),
      db.select().from(appSettings),
      db.select().from(sessions).where(eq(sessions.status, "active")),
      db.select().from(sessions).where(eq(sessions.status, "completed")),
    ])

  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))
  const currentCycle = Number.parseInt(settings.current_cycle ?? "1", 10)
  const tmByMacro: Record<number, string> = {
    1: settings.tm_macro1 ?? "110",
    2: settings.tm_macro2 ?? "113",
    3: settings.tm_macro3 ?? "116",
  }
  const activeWorkoutIds = new Set(activeSessions.map((s) => s.workoutId))

  // --- трекер позиции в программе ---
  const completedWorkoutIds = new Set(doneSessions.map((s) => s.workoutId))
  const totalWorkouts = allWorkouts.length
  const doneCount = allWorkouts.filter((w) =>
    completedWorkoutIds.has(w.id),
  ).length

  // идём по циклам начиная с текущего и ищем первую невыполненную тренировку
  const orderedCycles = [...allCycles].sort((a, b) => a.sortOrder - b.sortOrder)
  let nextWorkout: (typeof allWorkouts)[number] | null = null
  let nextCycle: (typeof allCycles)[number] | null = null
  for (const c of orderedCycles) {
    if (c.number < currentCycle) continue
    const cwSorted = allWorkouts
      .filter((w) => w.cycleId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const pending = cwSorted.find((w) => !completedWorkoutIds.has(w.id))
    if (pending) {
      nextWorkout = pending
      nextCycle = c
      break
    }
  }

  const macros = [1, 2, 3].map((m) => ({
    macro: m,
    cycles: allCycles.filter((c) => c.macrocycle === m),
  }))

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-5">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Жимовой блок
          </p>
          <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight">
            13 циклов · цель 123–127 кг
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {"≈3,5 месяца · 2 тренировки со штангой в цикле"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        {activeSessions.length > 0 && (
          <Link
            href={`/session/${activeSessions[0].id}`}
            className="mb-4 flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground"
          >
            <span className="flex items-center gap-2 font-semibold">
              <Flame className="size-5" aria-hidden="true" />
              Продолжить тренировку
            </span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        )}

        {activeSessions.length === 0 && nextWorkout && nextCycle && (
          <Link
            href={`/workout/${nextWorkout.id}`}
            className="mb-4 block rounded-lg border border-primary/60 bg-card px-4 py-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Следующая тренировка
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                {nextWorkout.kind === "cardio" ? (
                  <Bike className="size-5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Dumbbell className="size-5 shrink-0 text-primary" aria-hidden="true" />
                )}
                <span className="truncate">{nextWorkout.title}</span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Цикл {nextCycle.number} · {nextCycle.name}
            </p>
          </Link>
        )}

        <div className="mb-5">
          <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>Прогресс программы</span>
            <span className="font-mono">
              {doneCount} / {totalWorkouts}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={totalWorkouts}
            aria-label="Выполнено тренировок"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${totalWorkouts > 0 ? (doneCount / totalWorkouts) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {macros.map(({ macro, cycles: mc }) => (
            <section key={macro} aria-labelledby={`macro-${macro}`}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2
                  id={`macro-${macro}`}
                  className="text-pretty text-sm font-semibold text-muted-foreground"
                >
                  {MACRO_TITLES[macro]}
                </h2>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  ТМ {tmByMacro[macro]} кг
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {mc.map((cycle) => {
                  const cw = allWorkouts.filter((w) => w.cycleId === cycle.id)
                  const isCurrent = cycle.number === currentCycle
                  const hasActive = cw.some((w) => activeWorkoutIds.has(w.id))
                  return (
                    <li key={cycle.id}>
                      <div
                        className={`rounded-lg border ${
                          isCurrent
                            ? "border-primary/60 bg-card"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between px-4 pt-3">
                          <p className="font-semibold">
                            <span className="font-mono text-primary">
                              {cycle.number}
                            </span>
                            {" · "}
                            {cycle.name}
                          </p>
                          {isCurrent && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                              Текущий
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 px-4 pb-3 pt-2">
                          {cw.map((w) => {
                            const isCardio = w.kind === "cardio"
                            const active = activeWorkoutIds.has(w.id)
                            return (
                              <Link
                                key={w.id}
                                href={`/workout/${w.id}`}
                                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                  active
                                    ? "bg-primary text-primary-foreground"
                                    : isCardio
                                      ? "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                                      : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                                }`}
                              >
                                {isCardio ? (
                                  <Bike className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                                ) : (
                                  <Dumbbell className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                                )}
                                <span className="min-w-0 flex-1 truncate">
                                  {w.label === "A"
                                    ? "Тр. A"
                                    : w.label === "B"
                                      ? "Тр. B"
                                      : w.label === "B1"
                                        ? `Кардио ${w.cardioMinutes ?? ""}`
                                        : w.label === "B3"
                                          ? "Кардио кор."
                                          : w.label}
                                </span>
                                <ChevronRight
                                  className="size-4 shrink-0 opacity-60"
                                  aria-hidden="true"
                                />
                              </Link>
                            )
                          })}
                        </div>
                        {hasActive && (
                          <p className="px-4 pb-3 text-xs text-primary">
                            Есть незавершённая се��сия
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
