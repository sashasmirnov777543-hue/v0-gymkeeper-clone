import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Download, Gauge, HeartPulse, Scale } from "lucide-react";
import { db } from "@/lib/db";
import {
  loggedSets,
  programState,
  rhrMeasurements,
  rmrefReviewEvents,
  sessions,
  workoutExercises,
} from "@/lib/db/schema";
import { BottomNav } from "@/components/bottom-nav";
import { StatsView } from "@/components/stats-view";
import { assessRhrTrend } from "@/lib/rhr";
import { e1rmFromStandardTriple } from "@/lib/program/rmref";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [rows, rhrRows, stateRows, rmrefEvents, checkpoints] = await Promise.all([
    db
      .select({
        exerciseName: workoutExercises.name,
        weight: loggedSets.weight,
        reps: loggedSets.reps,
        rir: loggedSets.rir,
        startedAt: sessions.startedAt,
        sessionId: loggedSets.sessionId,
      })
      .from(loggedSets)
      .innerJoin(workoutExercises, eq(loggedSets.workoutExerciseId, workoutExercises.id))
      .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.status, "completed"),
          eq(loggedSets.isWarmup, false),
          eq(workoutExercises.excludeFromTonnage, false),
        ),
      )
      .orderBy(asc(sessions.startedAt)),
    db.select().from(rhrMeasurements).orderBy(asc(rhrMeasurements.measuredOn)).limit(60),
    db.select().from(programState).where(eq(programState.profileKey, "primary")).limit(1),
    db.select().from(rmrefReviewEvents).orderBy(desc(rmrefReviewEvents.createdAt)).limit(10),
    db
      .select({
        role: workoutExercises.role,
        weight: loggedSets.weight,
        reps: loggedSets.reps,
        rpe: loggedSets.rpe,
        date: sessions.startedAt,
      })
      .from(loggedSets)
      .innerJoin(workoutExercises, eq(loggedSets.workoutExerciseId, workoutExercises.id))
      .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.status, "completed"),
          inArray(workoutExercises.role, ["calibration", "test_triple"]),
        ),
      )
      .orderBy(desc(sessions.startedAt)),
  ]);
  const rhr = assessRhrTrend(
    rhrRows.map((row) => ({
      measuredOn: row.measuredOn,
      bpm: row.bpm,
      repeatedBpm: row.repeatedBpm,
      comparable: row.comparable,
      poorWellbeing: row.poorWellbeing,
    })),
  );
  const latestTriple = checkpoints.find((row) => row.role === "test_triple" && row.reps === 3);
  const tripleE1rm = latestTriple?.weight ? e1rmFromStandardTriple(Number(latestTriple.weight)) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-40">
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-6">
        <div><h1 className="text-2xl font-bold">Прогресс</h1><p className="mt-1 text-sm text-muted-foreground">RMref, стандартизированные тройки, RHR и рабочие подходы</p></div>
        <a href="/api/export" download className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground"><Download className="size-3.5" /> CSV</a>
      </header>

      <section className="grid grid-cols-3 gap-2 px-4">
        <div className="rounded-xl border border-border bg-card p-3"><Scale className="size-4 text-primary" /><p className="mt-2 text-[10px] uppercase text-muted-foreground">RMref</p><p className="font-mono text-lg font-bold">{Number(stateRows[0]?.rmrefKg ?? 115)} кг</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><Gauge className="size-4 text-primary" /><p className="mt-2 text-[10px] uppercase text-muted-foreground">Тройка e1RM</p><p className="font-mono text-lg font-bold">{tripleE1rm == null ? "—" : `${tripleE1rm.toFixed(1)} кг`}</p></div>
        <div className={`rounded-xl border p-3 ${rhr.yellowSignal ? "border-warning/50 bg-warning/10" : "border-border bg-card"}`}><HeartPulse className="size-4 text-primary" /><p className="mt-2 text-[10px] uppercase text-muted-foreground">RHR Δ</p><p className="font-mono text-lg font-bold">{rhr.delta == null ? "—" : `${rhr.delta >= 0 ? "+" : ""}${rhr.delta}`}</p></div>
      </section>

      {checkpoints.length > 0 && (
        <section className="mx-4 mt-4 rounded-xl border border-border bg-card p-4"><h2 className="font-bold">Калибровки и тестовая тройка</h2><div className="mt-3 space-y-2">{checkpoints.slice(0, 6).map((row, index) => <div key={`${row.date}-${index}`} className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{row.date.toLocaleDateString("ru-RU")} · {row.role}</span><strong className="font-mono">{row.weight}×{row.reps} @RPE {row.rpe ?? "—"}</strong></div>)}</div></section>
      )}

      {rhrRows.length > 0 && (
        <section className="mx-4 mt-4 rounded-xl border border-border bg-card p-4"><div className="flex justify-between"><h2 className="font-bold">RHR · последние измерения</h2><span className="text-xs text-muted-foreground">база {rhr.baseline ?? "—"}</span></div><div className="mt-3 flex h-28 items-end gap-1 overflow-hidden">{rhrRows.slice(-28).map((row) => { const value = row.repeatedBpm ?? row.bpm; return <div key={row.id} className="group flex min-w-2 flex-1 flex-col justify-end" title={`${row.measuredOn}: ${value}`}><div className={`rounded-t ${rhr.baseline != null && value - rhr.baseline >= 5 ? "bg-warning" : "bg-primary"}`} style={{ height: `${Math.max(8, Math.min(100, (value / 100) * 100))}%` }} /></div>; })}</div></section>
      )}

      {rmrefEvents.length > 0 && <section className="mx-4 mt-4 rounded-xl border border-border bg-card p-4"><h2 className="font-bold">История RMref</h2><div className="mt-2 space-y-1 text-sm text-muted-foreground">{rmrefEvents.map((row) => <p key={row.id}>{row.checkpoint}: {row.previousRmrefKg} → {row.proposedRmrefKg} кг · {row.status}</p>)}</div></section>}

      <StatsView rows={rows.map((row) => ({ exerciseName: row.exerciseName, weight: row.weight != null ? Number(row.weight) : null, reps: row.reps, rir: row.rir, date: row.startedAt.toISOString(), sessionId: row.sessionId }))} />
      <BottomNav />
    </main>
  );
}
