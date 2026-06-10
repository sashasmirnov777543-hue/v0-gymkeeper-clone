import Link from "next/link"
import { desc, eq, inArray } from "drizzle-orm"
import { CalendarDays, ChevronRight, TrendingUp } from "lucide-react"
import { db } from "@/lib/db"
import { cycles, loggedSets, sessions, workouts } from "@/lib/db/schema"
import { BottomNav } from "@/components/bottom-nav"

export const dynamic = "force-dynamic"

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
})

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const tmMacro = typeof params.tmMacro === "string" ? params.tmMacro : null
  const newTm = typeof params.newTm === "string" ? params.newTm : null
  const oldTm =
    typeof params.oldTm === "string" && params.oldTm !== "" ? params.oldTm : null
  const e1rm = typeof params.e1rm === "string" ? params.e1rm : null
  const amrap = typeof params.amrap === "string" ? params.amrap : null

  const rows = await db
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
      finishedAt: sessions.finishedAt,
      status: sessions.status,
      workoutTitle: workouts.title,
      cycleNumber: cycles.number,
      cycleName: cycles.name,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .orderBy(desc(sessions.startedAt))
    .limit(100)

  const sessionIds = rows.map((r) => r.id)
  const setCounts: Record<number, { sets: number; volume: number }> = {}
  if (sessionIds.length > 0) {
    const allSets = await db
      .select({
        sessionId: loggedSets.sessionId,
        weight: loggedSets.weight,
        reps: loggedSets.reps,
      })
      .from(loggedSets)
      .where(inArray(loggedSets.sessionId, sessionIds))
    for (const s of allSets) {
      const entry = (setCounts[s.sessionId] ??= { sets: 0, volume: 0 })
      entry.sets += 1
      const w = s.weight != null ? Number.parseFloat(s.weight) : 0
      entry.volume += w * (s.reps ?? 0)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-24">
      <header className="px-4 pb-2 pt-6">
        <h1 className="text-xl font-bold">История тренировок</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length > 0
            ? `Всего сессий: ${rows.length}`
            : "Пока нет завершённых тренировок"}
        </p>
      </header>

      {tmMacro && newTm && (
        <div className="px-4 pt-2">
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
              ТМ пересчитан по AMRAP
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {amrap && `AMRAP ${amrap.replace("x", " кг × ")} повт.`}
              {e1rm && ` → e1RM ${e1rm} кг.`}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-foreground">
              {"Новый ТМ Макро "}
              {tmMacro}
              {": "}
              {oldTm && (
                <span className="text-muted-foreground line-through">
                  {oldTm} кг
                </span>
              )}
              {oldTm && " → "}
              <span className="font-bold">{newTm} кг</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              Рабочие веса всех циклов Макро {tmMacro} обновлены — новые
              значения уже в плане тренировок
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 px-4 py-2">
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <CalendarDays className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-pretty">
              Начните первую тренировку на главном экране — она появится здесь
            </p>
          </div>
        )}
        {rows.map((r) => {
          const stats = setCounts[r.id] ?? { sets: 0, volume: 0 }
          return (
            <Link
              key={r.id}
              href={`/session/${r.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {dateFmt.format(r.startedAt)} · {timeFmt.format(r.startedAt)}
                </p>
                <h2 className="truncate text-sm font-semibold">
                  Цикл {r.cycleNumber} · {r.workoutTitle}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stats.sets} подх. · тоннаж {Math.round(stats.volume)} кг
                  {r.status === "active" && (
                    <span className="ml-2 text-primary">— активна</span>
                  )}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
      </div>

      <BottomNav />
    </main>
  )
}
