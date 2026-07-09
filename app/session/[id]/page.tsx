import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import {
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import {
  getLastCardioSession,
  getLastSetsByExerciseNames,
} from "@/app/actions/workout";
import { SessionLogger } from "@/components/session-logger";
import { CardioSession } from "@/components/cardio-session";
import { isIsolationExercise, isMiniTaper } from "@/lib/training-logic";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = Number.parseInt(id, 10);
  if (Number.isNaN(sessionId)) notFound();

  await ensureSchema();

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) notFound();

  const [workout] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, session.workoutId))
    .limit(1);
  if (!workout) notFound();

  const [cardioCycleRow] =
    workout.kind === "cardio"
      ? await db
          .select()
          .from(cycles)
          .where(eq(cycles.id, workout.cycleId))
          .limit(1)
      : [undefined];

  if (workout.kind === "cardio") {
    const lastCardioRow = await getLastCardioSession(workout.title, session.id);
    const lastCardio = lastCardioRow
      ? {
          speed: lastCardioRow.speed,
          resistance: lastCardioRow.resistance,
          durationSeconds: lastCardioRow.durationSeconds,
          startedAt: lastCardioRow.startedAt.toISOString(),
        }
      : null;
    const cardioSession = {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      durationSeconds: session.durationSeconds,
      speed: session.cardioSpeed,
      resistance: session.cardioResistance,
      readinessLevel: session.readinessLevel,
      cardioRpe: session.cardioRpe,
      cardioTalkTest: session.cardioTalkTest,
      cardioSymptoms: session.cardioSymptoms,
    };
    const cardioWorkout = {
      id: workout.id,
      title: workout.title,
      cardioZone: workout.cardioZone,
      cardioMinutes: workout.cardioMinutes,
    };
    const cardioCycle = {
      number: cardioCycleRow?.number ?? 0,
      name: cardioCycleRow?.name ?? "",
    };
    return (
      <CardioSession
        session={cardioSession}
        workout={cardioWorkout}
        cycle={cardioCycle}
        lastCardio={lastCardio}
      />
    );
  }

  const [[cycle], exercises, sets] = await Promise.all([
    db.select().from(cycles).where(eq(cycles.id, workout.cycleId)).limit(1),
    db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workout.id))
      .orderBy(asc(workoutExercises.sortOrder)),
    db
      .select()
      .from(loggedSets)
      .where(eq(loggedSets.sessionId, sessionId))
      .orderBy(asc(loggedSets.id)),
  ]);

  const lastSetsByName = await getLastSetsByExerciseNames(
    exercises.map((e) => e.name),
  );

  const sessionProp = {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    notes: session.notes,
    readinessLevel: session.readinessLevel,
  };
  const workoutProp = { id: workout.id, title: workout.title };
  const cycleProp = {
    number: cycle?.number ?? 0,
    name: cycle?.name ?? "",
    block: cycle?.block ?? "v9",
  };
  const visibleExercises = isMiniTaper(session.readinessLevel)
    ? exercises.filter((e) => !isIsolationExercise(e.name))
    : exercises;
  const exercisesProp = visibleExercises.map((e) => ({
    id: e.id,
    name: e.name,
    weightText: e.weightText,
    tempo: e.tempo,
    targetReps: e.targetReps,
    targetSets: e.targetSets,
    targetRirMin: e.targetRirMin,
    targetRirMax: e.targetRirMax,
    comment: e.comment,
    restSeconds: e.restSeconds,
  }));
  const initialSetsProp = sets.map((s) => ({
    id: s.id,
    workoutExerciseId: s.workoutExerciseId,
    setNumber: s.setNumber,
    weight: s.weight != null ? Number.parseFloat(s.weight) : null,
    reps: s.reps,
    rir: s.rir,
    velocity: s.velocity,
    stickingPoint: s.stickingPoint,
  }));

  return (
    <SessionLogger
      session={sessionProp}
      workout={workoutProp}
      cycle={cycleProp}
      exercises={exercisesProp}
      initialSets={initialSetsProp}
      lastSetsByName={lastSetsByName}
    />
  );
}
