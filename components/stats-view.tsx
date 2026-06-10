"use client"

import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { BarChart3 } from "lucide-react"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { epley1RM } from "@/lib/recommend"

type Row = {
  exerciseName: string
  weight: number | null
  reps: number | null
  rir: number | null
  date: string
  sessionId: number
}

const chartConfig = {
  e1rm: { label: "Расчётный 1ПМ", color: "var(--chart-1)" },
} satisfies ChartConfig

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })

export function StatsView({ rows }: { rows: Row[] }) {
  const exerciseNames = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of rows) {
      if (r.weight != null && r.reps != null) {
        counts[r.exerciseName] = (counts[r.exerciseName] ?? 0) + 1
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }, [rows])

  const [selected, setSelected] = useState<string | null>(null)
  const active = selected ?? exerciseNames[0] ?? null

  const { chartData, best, totalVolume, totalSets } = useMemo(() => {
    if (!active) return { chartData: [], best: null, totalVolume: 0, totalSets: 0 }
    const filtered = rows.filter(
      (r) => r.exerciseName === active && r.weight != null && r.reps != null,
    )
    // лучший e1RM на каждую сессию
    const bySession = new Map<number, { date: string; e1rm: number; weight: number }>()
    let volume = 0
    for (const r of filtered) {
      const e = epley1RM(r.weight as number, r.reps as number)
      volume += (r.weight as number) * (r.reps as number)
      const cur = bySession.get(r.sessionId)
      if (!cur || e > cur.e1rm) {
        bySession.set(r.sessionId, {
          date: r.date,
          e1rm: Math.round(e * 10) / 10,
          weight: r.weight as number,
        })
      }
    }
    const data = Array.from(bySession.values()).map((d) => ({
      label: dateFmt.format(new Date(d.date)),
      e1rm: d.e1rm,
    }))
    const bestRow =
      filtered.length > 0
        ? filtered.reduce((acc, r) =>
            (r.weight as number) > (acc.weight as number) ? r : acc,
          )
        : null
    return {
      chartData: data,
      best: bestRow,
      totalVolume: Math.round(volume),
      totalSets: filtered.length,
    }
  }, [rows, active])

  if (exerciseNames.length === 0) {
    return (
      <div className="mx-4 my-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <BarChart3 className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-pretty">
          Завершите хотя бы одну тренировку с записанными подходами — здесь появятся графики прогресса
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Упражнение">
        {exerciseNames.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={active === name}
            onClick={() => setSelected(name)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active === name
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {name.length > 30 ? `${name.slice(0, 30)}…` : name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-card px-3 py-3 text-center">
          <p className="text-lg font-bold">
            {best?.weight != null ? `${best.weight}` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">лучший вес, кг</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-3 text-center">
          <p className="text-lg font-bold">{totalSets}</p>
          <p className="text-xs text-muted-foreground">подходов</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-3 text-center">
          <p className="text-lg font-bold">{totalVolume.toLocaleString("ru-RU")}</p>
          <p className="text-xs text-muted-foreground">тоннаж, кг</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Расчётный 1ПМ по сессиям</h2>
        {chartData.length < 2 ? (
          <p className="py-6 text-center text-xs text-muted-foreground text-pretty">
            Нужно минимум две завершённые сессии с этим упражнением, чтобы построить график
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <AreaChart data={chartData} margin={{ left: -10, right: 10 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.2} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                fontSize={11}
                domain={["dataMin - 5", "dataMax + 5"]}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="e1rm"
                type="monotone"
                stroke="var(--color-e1rm)"
                fill="var(--color-e1rm)"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}
