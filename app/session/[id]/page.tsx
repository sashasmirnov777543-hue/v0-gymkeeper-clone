import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
  programState,
} from "@/lib/db/schema";
import {
  finishSession,
  cancelSession,
  getLastSetsByExerciseNames,
} from "@/app/actions/workout";
import { SessionLogger } from "@/components/session-logger";
import { CardioSession } from "@/components/cardio-session";
import { readSnapshot } from "@/lib/program/server";
import { effectiveSafetyProfile, safetyProfile } from "@/lib/program/policy";

export const dynamic = "force-dynamic";
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (!session) notFound();
  const [workout] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, session.workoutId))
    .limit(1);
  if (!workout) notFound();
  const [[cycle], raw, sets, [state]] = await Promise.all([
    db.select().from(cycles).where(eq(cycles.id, workout.cycleId)).limit(1),
    db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workout.id))
      .orderBy(asc(workoutExercises.sortOrder)),
    db
      .select()
      .from(loggedSets)
      .where(eq(loggedSets.sessionId, id))
      .orderBy(asc(loggedSets.id)),
    db
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1),
  ]);
  const snapshot = readSnapshot(session.adaptationPlan);
  const profile = snapshot
    ? session.status === "active"
      ? effectiveSafetyProfile(
          snapshot.profile,
          safetyProfile(state?.safetyProfile),
        )
      : snapshot.profile
    : safetyProfile(state?.safetyProfile);
  const legacyActive = !snapshot && session.status === "active";
  const status = legacyActive ? "legacy_read_only" : session.status;
  const cycleProps = {
    number: cycle?.number ?? 0,
    name: cycle?.name ?? "",
    block: cycle?.block ?? "h2",
  };
  const legacyNotice = legacyActive ? (
    <section className="mx-auto max-w-lg space-y-3 border-b border-warning/40 bg-warning/10 p-4 text-sm">
      <h1 className="text-lg font-bold">Сессия прошлой редакции</h1>
      <p>
        Записанные результаты сохранены без пересчёта. Завершите или отмените
        эту сессию, затем откройте новую программу. Новые нагрузки старой
        редакции не подставляются.
      </p>
      <div className="flex gap-3">
        <form action={finishSession.bind(null, session.id)}>
          <button className="min-h-11 rounded-lg border border-border px-3">
            Завершить и сохранить
          </button>
        </form>
        <form action={cancelSession.bind(null, session.id)}>
          <button className="min-h-11 rounded-lg border border-border px-3">
            Отменить активную сессию
          </button>
        </form>
      </div>
    </section>
  ) : null;
  if (workout.kind === "cardio")
    return (
      <>
        {legacyNotice}
        <CardioSession
          session={{
            id: session.id,
            status,
            startedAt: session.startedAt.toISOString(),
            durationSeconds: session.durationSeconds,
            speed: session.cardioSpeed,
            resistance: session.cardioResistance,
            readinessLevel: session.readinessLevel,
            adaptationPlan: session.adaptationPlan,
            cardioRpe: session.cardioRpe,
            cardioTalkTest: session.cardioTalkTest,
            cardioSymptoms: session.cardioSymptoms,
            supportLog: session.supportLog,
            modality: session.cardioModality,
            warmupMinutes: session.cardioWarmupMinutes,
            mainMinutes: session.cardioMainMinutes,
            cooldownMinutes: session.cardioCooldownMinutes,
          }}
          workout={{
            id: workout.id,
            title: workout.title,
            cardioZone: workout.cardioZone,
            cardioMinutes: workout.cardioMinutes,
            prescription: workout.prescription,
          }}
          cycle={cycleProps}
        />
      </>
    );
  // New sessions use their immutable start snapshot. Archived rows never use today's R.
  const exercises =
    snapshot?.exercises ??
    raw.map((e) => ({
      id: e.id,
      name: e.name,
      weightText: e.weightText,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      targetRirMin: e.targetRirMin,
      targetRirMax: e.targetRirMax,
      targetRpeMin: e.targetRpeMin == null ? null : Number(e.targetRpeMin),
      targetRpeMax: e.targetRpeMax == null ? null : Number(e.targetRpeMax),
      role: e.role,
      isOptional: e.isOptional,
      condition: e.conditionCode,
      comment: e.comment,
      restSeconds: e.restSeconds,
      tempo: e.tempo,
    }));
  const last = await getLastSetsByExerciseNames(exercises.map((e) => e.name));
  return (
    <>
      {legacyNotice}
      <SessionLogger
        session={{
          id: session.id,
          status,
          startedAt: session.startedAt.toISOString(),
          notes: session.notes,
          readinessLevel: session.readinessLevel,
          readinessReasons: session.readinessReasons,
          adaptationPlan: session.adaptationPlan,
          safetyStopped: session.safetyStopped,
        }}
        workout={{
          id: workout.id,
          title: workout.title,
          slot: workout.label,
          branches: workout.branches,
        }}
        cycle={cycleProps}
        exercises={exercises}
        initialSets={sets.map((s) => ({
          ...s,
          weight: s.weight == null ? null : Number(s.weight),
          rpe: s.rpe == null ? null : Number(s.rpe),
        }))}
        lastSetsByName={last}
        rmrefKg={snapshot?.baseKg ?? Number(state?.rmrefKg ?? 115)}
        profile={profile}
      />
    </>
  );
}
