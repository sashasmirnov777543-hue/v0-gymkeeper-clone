import { StickingPointCard } from "@/components/sticking-point-card";
import { BlockExhaustedBanner } from "@/components/block-exhausted-banner";
import Link from "next/link"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appSettings, cycles, workouts, sessions } from "@/lib/db/schema"
import { BottomNav } from "@/components/bottom-nav"
import { BlockSwitcher } from "@/components/block-switcher"
import { AppVersion } from "@/components/app-version"
import { Bike, ChevronRight, Dumbbell, Flame } from "lucide-react"

export const dynamic = "force-dynamic"

const MACRO_TITLES: Record<string, Record<number, string>> = {
  v9: {
    1: "Этап 1 — техника и вход (циклы 1–4)",
    2: "Этап 2 — силовое накопление (циклы 5–8)",
    3: "Этап 3 — реализация и тест (циклы 9–13)",
  },
  h2: {
    1: "Этап 1 — накопление (циклы 1–5)",
    2: "Этап 2 — интенсификация (циклы 6–8)",
    3: "Этап 3 — переход к V9 (цикл 9)",
  },
};

const BLOCK_HEADER = {
  v9: {
    kicker: "Силовой блок · V9",
    title: "13 циклов · цель 122,5–125 кг",
    subtitle: "104 дня · 2 силовые и 2 кардио-сессии в каждом 8-дневном цикле",
  },
  h2: {
    kicker: "Гипертрофия и ОФП · H2",
    title: "9 циклов · фундамент перед V9",
    subtitle: "72 дня · контролируемый объём, техника жима и спокойное кардио",
  },
} as const;

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
  const activeBlock = (settings.active_block === "h2" ? "h2" : "v9") as
    | "v9"
    | "h2"
  const blockCycles = allCycles.filter((c) => (c.block ?? "v9") === activeBlock)
  const blockCycleIds = new Set(blockCycles.map((c) => c.id))
  const blockWorkouts = allWorkouts.filter((w) => blockCycleIds.has(w.cycleId))
  const currentCycle = Number.parseInt(
    (activeBlock === "h2"
      ? settings.current_cycle_h2
      : settings.current_cycle) ?? "1",
    10,
  )
  const tmByMacro: Record<number, string> = {
    1: settings.tm_macro1 ?? "110",
    2: settings.tm_macro2 ?? "113",
    3: settings.tm_macro3 ?? "116",
  }
  const activeWorkoutIds = new Set(activeSessions.map((s) => s.workoutId))
  const completedWorkoutIds = new Set(doneSessions.map((s) => s.workoutId))
  const totalWorkouts = blockWorkouts.length
  const doneCount = blockWorkouts.filter((w) =>
    completedWorkoutIds.has(w.id),
  ).length

  const orderedCycles = [...blockCycles].sort((a, b) => a.sortOrder - b.sortOrder)

  // Компактная маркировка: номер цикла + день B1–B4.
  const labelByWorkoutId = new Map<number, { label: string; isCardio: boolean }>();
  for (const c of orderedCycles) {
    const cycleWorkouts = blockWorkouts
      .filter((w) => w.cycleId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const w of cycleWorkouts) {
      labelByWorkoutId.set(w.id, {
        label: `${c.number}·${w.label}`,
        isCardio: w.kind === "cardio",
      });
    }
  }

  let nextWorkout: (typeof allWorkouts)[number] | null = null
  let nextCycle: (typeof allCycles)[number] | null = null
  for (const c of orderedCycles) {
    if (c.number < currentCycle) continue
    const cwSorted = blockWorkouts
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
    cycles: orderedCycles.filter((c) => c.macrocycle === m),
  }))
  const header = BLOCK_HEADER[activeBlock]

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-5">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            {header.kicker}
          </p>
          <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight">
            {header.title}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {header.subtitle}
          </p>
          <div className="mt-3">
            <BlockSwitcher active={activeBlock} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        <BlockExhaustedBanner />
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
              style={{ width: `${totalWorkouts > 0 ? (doneCount / totalWorkouts) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <StickingPointCard />
          {macros.map(({ macro, cycles: mc }) => {
            const macroItems = mc.flatMap((c) =>
              blockWorkouts
                .filter((w) => w.cycleId === c.id)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((w) => ({ w, cycle: c })),
            )
            if (macroItems.length === 0) return null
            return (
              <section key={macro} aria-labelledby={`macro-${macro}`}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2
                    id={`macro-${macro}`}
                    className="text-pretty text-sm font-semibold text-muted-foreground"
                  >
                    {MACRO_TITLES[activeBlock][macro]}
                  </h2>
                  {activeBlock === "v9" && (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      RMref {tmByMacro[macro]} кг
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {macroItems.map(({ w, cycle }) => {
                    const meta = labelByWorkoutId.get(w.id)
                    const label = meta?.label ?? "?"
                    const isCardio = meta?.isCardio ?? w.kind === "cardio"
                    const done = completedWorkoutIds.has(w.id)
                    const active = activeWorkoutIds.has(w.id)
                    const isNext = nextWorkout?.id === w.id
                    const cls = active
                      ? "border-primary bg-primary text-primary-foreground"
                      : done
                        ? "border-border bg-secondary/40 text-muted-foreground"
                        : isNext
                          ? "border-primary bg-card text-foreground ring-2 ring-primary"
                          : isCardio
                            ? "border-border bg-secondary/50 text-muted-foreground"
                            : "border-border bg-secondary text-secondary-foreground"
                    return (
                      <Link
                        key={w.id}
                        href={`/workout/${w.id}`}
                        title={`Цикл ${cycle.number} · ${cycle.name}`}
                        aria-label={`${isCardio ? "Кардио" : "Силовая"} ${label}${done ? ", выполнена" : ""}, цикл ${cycle.number}`}
                        className={`relative flex aspect-square items-center justify-center rounded-lg border text-sm font-bold transition-colors ${cls}`}
                      >
                        <span
                          className={`font-mono ${done ? "line-through decoration-2" : ""}`}
                        >
                          {label}
                        </span>
                        {active && (
                          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary-foreground" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">С</span> — силовая ·{" "}
          <span className="font-mono font-semibold text-foreground">К</span> — кардио ·{" "}
          <span className="line-through decoration-2">зачёркнут</span> — выполнена
        </p>
        <AppVersion />
      </main>

      <BottomNav />
    </div>
  )
}
