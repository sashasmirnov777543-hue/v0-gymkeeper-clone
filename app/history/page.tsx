import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Bike, CalendarDays, ChevronRight, Dumbbell } from "lucide-react";
import { db } from "@/lib/db";
import {
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import { BottomNav } from "@/components/bottom-nav";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

export default async function HistoryPage() {
  const rows = await db
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
      status: sessions.status,
      readinessLevel: sessions.readinessLevel,
      safetyStopped: sessions.safetyStopped,
      shoulderPain: sessions.shoulderPain,
      backPain: sessions.backPain,
      durationSeconds: sessions.durationSeconds,
      cardioMainMinutes: sessions.cardioMainMinutes,
      cardioRpe: sessions.cardioRpe,
      cardioTalkTest: sessions.cardioTalkTest,
      workoutTitle: workouts.title,
      slot: workouts.label,
      kind: workouts.kind,
      block: cycles.block,
      cycleNumber: cycles.number,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .orderBy(desc(sessions.startedAt))
    .limit(150);
  const ids = rows.map((row) => row.id);
  const stats: Record<number, { sets: number; volume: number; maxRpe: number | null; maxPain: number | null }> = {};
  if (ids.length) {
    const sets = await db
      .select({
        sessionId: loggedSets.sessionId,
        weight: loggedSets.weight,
        reps: loggedSets.reps,
        rpe: loggedSets.rpe,
        painScore: loggedSets.painScore,
        isWarmup: loggedSets.isWarmup,
        excludeFromTonnage: workoutExercises.excludeFromTonnage,
      })
      .from(loggedSets)
      .innerJoin(workoutExercises, eq(loggedSets.workoutExerciseId, workoutExercises.id))
      .where(inArray(loggedSets.sessionId, ids));
    for (const set of sets) {
      const item = (stats[set.sessionId] ??= { sets: 0, volume: 0, maxRpe: null, maxPain: null });
      item.sets += 1;
      if (!set.isWarmup && !set.excludeFromTonnage) {
        item.volume += Number(set.weight ?? 0) * Number(set.reps ?? 0);
      }
      if (set.rpe != null) item.maxRpe = Math.max(item.maxRpe ?? 0, Number(set.rpe));
      if (set.painScore != null) item.maxPain = Math.max(item.maxPain ?? 0, set.painScore);
    }
  }
  const completed = rows.filter((row) => row.status === "completed").length;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg pb-40">
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-2xl font-bold">Журнал</h1>
        <p className="mt-1 text-sm text-muted-foreground">{completed} завершённых сессий · план и факт без разминок в тоннаже</p>
      </header>
      <div className="space-y-2 px-4">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center"><CalendarDays className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Завершённые тренировки появятся здесь</p></div>
        )}
        {rows.map((row) => {
          const item = stats[row.id] ?? { sets: 0, volume: 0, maxRpe: null, maxPain: null };
          const pain = Math.max(row.shoulderPain ?? 0, row.backPain ?? 0, item.maxPain ?? 0);
          return (
            <Link key={row.id} href={`/session/${row.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${row.kind === "cardio" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                {row.kind === "cardio" ? <Bike className="size-5" /> : <Dumbbell className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{dateFmt.format(row.startedAt)}</span>{row.readinessLevel && <span className={`rounded-full px-2 py-0.5 readiness-${row.readinessLevel}`}>{row.readinessLevel}</span>}</div>
                <h2 className="truncate text-sm font-semibold">{row.block.toUpperCase()}-{row.cycleNumber} {row.slot} · {row.workoutTitle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.kind === "cardio"
                    ? `${row.cardioMainMinutes ?? Math.round((row.durationSeconds ?? 0) / 60)} мин · RPE ${row.cardioRpe ?? "—"} · ${row.cardioTalkTest ?? "разговорный тест не записан"}`
                    : `${item.sets} подх. · тоннаж ${Math.round(item.volume)} кг · max RPE ${item.maxRpe ?? "—"} · боль ${pain}/10`}
                  {row.status === "active" ? " · активна" : ""}
                  {row.safetyStopped ? " · safety stop" : ""}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
      <BottomNav />
    </main>
  );
}
