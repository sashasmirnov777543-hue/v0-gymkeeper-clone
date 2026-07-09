"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { e1rmForStats, isE1rmExercise } from "@/lib/stats";
type Row = {
  exerciseName: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  date: string;
  sessionId: number;
};
const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});
export function StatsView({ rows }: { rows: Row[] }) {
  const names = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows)
      if (r.weight != null && r.reps != null)
        c[r.exerciseName] = (c[r.exerciseName] ?? 0) + 1;
    return Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n);
  }, [rows]);
  const [selected, setSelected] = useState<string | null>(null),
    active = selected ?? names[0] ?? null,
    useE1rm = active ? isE1rmExercise(active) : false;
  const summary = useMemo(() => {
    if (!active)
      return { chartData: [], bestWeight: null, totalVolume: 0, totalSets: 0 };
    const f = rows.filter(
        (r) => r.exerciseName === active && r.weight != null && r.reps != null,
      ),
      by = new Map<number, { date: string; value: number }>();
    let volume = 0,
      best = 0;
    for (const r of f) {
      const w = r.weight as number,
        reps = r.reps as number;
      volume += w * reps;
      best = Math.max(best, w);
      const value = useE1rm ? e1rmForStats(active, w, reps) : w;
      if (value == null) continue;
      const cur = by.get(r.sessionId);
      if (!cur || value > cur.value)
        by.set(r.sessionId, { date: r.date, value });
    }
    return {
      chartData: Array.from(by.values()).map((x) => ({
        label: dateFmt.format(new Date(x.date)),
        value: x.value,
      })),
      bestWeight: best || null,
      totalVolume: Math.round(volume),
      totalSets: f.length,
    };
  }, [rows, active, useE1rm]);
  if (!names.length)
    return (
      <div className="mx-4 my-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <BarChart3 className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Завершите тренировку — здесь появится прогресс.
        </p>
      </div>
    );
  const config = {
    value: {
      label: useE1rm ? "Расчётный 1ПМ" : "Максимальный вес",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;
  const margin = { left: 0, right: 8, top: 8, bottom: 0 };
  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {names.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${active === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
          >
            {n.length > 30 ? `${n.slice(0, 30)}…` : n}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={summary.bestWeight ?? "—"} label="лучший вес, кг" />
        <Stat value={summary.totalSets} label="подходов" />
        <Stat
          value={summary.totalVolume.toLocaleString("ru-RU")}
          label="тоннаж, кг"
        />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">
          {useE1rm ? "Расчётный 1ПМ по сессиям" : "Максимальный вес по сессиям"}
        </h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          {useE1rm
            ? "Только варианты жима и подходы 1–10 повторов."
            : "Для изоляции e1RM не рассчитывается."}
        </p>
        {summary.chartData.length < 2 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Нужно минимум две сессии.
          </p>
        ) : (
          <ChartContainer config={config} className="h-56 w-full">
            <AreaChart data={summary.chartData} margin={margin}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis
                tickLine={false}
                axisLine={false}
                domain={["dataMin - 5", "dataMax + 5"]}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                fill="var(--color-value)"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-2 py-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
