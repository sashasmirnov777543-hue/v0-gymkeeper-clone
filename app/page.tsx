import Link from "next/link"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appSettings, cycles, workouts, sessions } from "@/lib/db/schema"
import { BottomNav } from "@/components/bottom-nav"
import { ChevronRight, Flame } from "lucide-react"

export const dynamic = "force-dynamic"

const MACRO_TITLES: Record<number, string> = {
  1: "Макроцикл 1 — Объёмная база + проход середины",
  2: "Макроцикл 2 — Тяжёлые веса и кластеры",
  3: "Макроцикл 3 — Реализация + пик",
}

export default async function HomePage() {
  const [allCycles, allWorkouts, settingsRows, activeSessions] =
    await Promise.all([
      db.select().from(cycles).orderBy(asc(cycles.sortOrder)),
      db.select().from(workouts).orderBy(asc(workouts.sortOrder)),
      db.select().from(appSettings),
      db.select().from(sessions).where(eq(sessions.status, "active")),
    ])

  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))
  const currentCycle = Number.parseInt(settings.current_cycle ?? "1", 10)
  const tmByMacro: Record<number, string> = {
    1: settings.tm_macro1 ?? "110",
    2: settings.tm_macro2 ?? "113",
    3: settings.tm_macro3 ?? "116",
  }
  const activeWorkoutIds = new Set(activeSessions.map((s) => s.workoutId))

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
                        <div className="flex gap-2 px-4 pb-3 pt-2">
                          {cw.map((w) => (
                            <Link
                              key={w.id}
                              href={`/workout/${w.id}`}
                              className={`flex flex-1 items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                activeWorkoutIds.has(w.id)
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                              }`}
                            >
                              <span>{w.label === "A" ? "Тр. A" : "Тр. B"}</span>
                              <ChevronRight
                                className="size-4 opacity-60"
                                aria-hidden="true"
                              />
                            </Link>
                          ))}
                        </div>
                        {hasActive && (
                          <p className="px-4 pb-3 text-xs text-primary">
                            Есть незавершённая сессия
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
