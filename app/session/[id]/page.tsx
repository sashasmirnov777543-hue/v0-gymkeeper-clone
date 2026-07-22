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
  programState,
} from "@/lib/db/schema";
import {
  getLastCardioSession,
  getLastSetsByExerciseNames,
} from "@/app/actions/workout";
import { SessionLogger } from "@/components/session-logger";
import { CardioSession } from "@/components/cardio-session";
import { weightFromRmrefPercent } from "@/lib/program/rmref";

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
      adaptationPlan: session.adaptationPlan,
      cardioRpe: session.cardioRpe,
      cardioTalkTest: session.cardioTalkTest,
      cardioSymptoms: session.cardioSymptoms,
      modality: session.cardioModality,
      warmupMinutes: session.cardioWarmupMinutes,
      mainMinutes: session.cardioMainMinutes,
      cooldownMinutes: session.cardioCooldownMinutes,
    };
    const cardioWorkout = {
      id: workout.id,
      title: workout.title,
      cardioZone: workout.cardioZone,
      cardioMinutes: workout.cardioMinutes,
      prescription: workout.prescription,
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

  const [[cycle], exercises, sets, stateRows] = await Promise.all([
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
    db.select().from(programState).where(eq(programState.profileKey, "primary")).limit(1),
  ]);

  const lastSetsByName = await getLastSetsByExerciseNames(
    exercises.map((e) => e.name),
  );

  const rmrefKg = Number(stateRows[0]?.rmrefKg ?? 115);
  const adaptation =
    session.adaptationPlan && typeof session.adaptationPlan === "object"
      ? (session.adaptationPlan as {
          coachAdjustment?: { patch?: Record<string, unknown> } | null;
        })
      : null;
  const coachPatch = adaptation?.coachAdjustment?.patch ?? {};
  const skippedExerciseIds = new Set(
    Array.isArray(coachPatch.skipOptionalExerciseIds)
      ? coachPatch.skipOptionalExerciseIds.map(String)
      : [],
  );
  const weightReductionPercent =
    coachPatch.weightReductionPercent === 2.5 || coachPatch.weightReductionPercent === 5
      ? Number(coachPatch.weightReductionPercent)
      : 0;
  const removeWorkingSets = coachPatch.removeWorkingSets === 1 ? 1 : 0;
  const sessionProp = {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    notes: session.notes,
    readinessLevel: session.readinessLevel,
    readinessReasons: session.readinessReasons,
    adaptationPlan: session.adaptationPlan,
    safetyStopped: session.safetyStopped,
  };
  const workoutProp = {
    id: workout.id,
    title: workout.title,
    slot: workout.label,
    branches: workout.branches,
  };
  const cycleProp = {
    number: cycle?.number ?? 0,
    name: cycle?.name ?? "",
    block: cycle?.block ?? "v9",
  };

  let visibleExercises = exercises.filter((exercise) => {
    if (
      skippedExerciseIds.has(String(exercise.id)) ||
      (exercise.programKey && skippedExerciseIds.has(exercise.programKey))
    ) {
      return false;
    }
    if (coachPatch.stopSecondaryPressing === true && exercise.role.includes("secondary")) {
      return false;
    }
    if (exercise.role.includes("direct_1rm")) {
      return session.testBranch === "direct_1rm";
    }
    if (exercise.role.includes("test_triple")) {
      return session.testBranch === "triple" || session.testBranch == null;
    }
    return true;
  });
  if (session.readinessLevel === "red") {
    visibleExercises = [];
  } else if (session.readinessLevel === "orange") {
    const primary = exercises.find(
      (exercise) =>
        exercise.role.includes("primary") ||
        /соревновательный.*жим|жим лёжа с паузой|паузный жим/i.test(exercise.name),
    );
    visibleExercises = primary ? [primary] : [];
  } else if (session.readinessLevel === "yellow") {
    visibleExercises = exercises.filter(
      (exercise) =>
        !exercise.isOptional &&
        !exercise.role.includes("single") &&
        !exercise.role.includes("test") &&
        !exercise.role.includes("calibration"),
    );
  }

  const reduceSetsText = (value: string | null) => {
    if (!value || removeWorkingSets === 0 || !/^\d+$/.test(value.trim())) return value;
    return String(Math.max(1, Number(value) - removeWorkingSets));
  };
  const exercisesProp = visibleExercises.map((e) => {
    const orangeTechnique = session.readinessLevel === "orange";
    const pctMin = e.pctMin != null ? Number(e.pctMin) : null;
    const pctMax = e.pctMax != null ? Number(e.pctMax) : null;
    const adjustedWeightText =
      weightReductionPercent > 0 && pctMin != null
        ? `${weightFromRmrefPercent(rmrefKg, pctMin * (1 - weightReductionPercent / 100))}${pctMax != null && pctMax !== pctMin ? `–${weightFromRmrefPercent(rmrefKg, pctMax * (1 - weightReductionPercent / 100))}` : ""} кг · подтверждённое снижение ${weightReductionPercent}%`
        : e.weightText;
    return {
      id: e.id,
      name: e.name,
      weightText: orangeTechnique
        ? `50–65% RMref · ${weightFromRmrefPercent(rmrefKg, 50)}–${weightFromRmrefPercent(rmrefKg, 65)} кг`
        : adjustedWeightText,
      tempo: e.tempo,
      targetReps: orangeTechnique ? "3" : e.targetReps,
      targetSets: orangeTechnique ? "2–3" : reduceSetsText(e.targetSets),
      targetRirMin: orangeTechnique ? 4 : e.targetRirMin,
      targetRirMax: orangeTechnique ? 5 : e.targetRirMax,
      targetRpeMin: e.targetRpeMin != null ? Number(e.targetRpeMin) : null,
      targetRpeMax: e.targetRpeMax != null ? Number(e.targetRpeMax) : null,
      role: e.role,
      isOptional: e.isOptional,
      condition: e.conditionCode,
      percentMin: e.pctMin != null ? Number(e.pctMin) : null,
      percentMax: e.pctMax != null ? Number(e.pctMax) : null,
      comment: e.comment,
      restSeconds: e.restSeconds,
    };
  });
  const initialSetsProp = sets.map((s) => ({
    id: s.id,
    workoutExerciseId: s.workoutExerciseId,
    setNumber: s.setNumber,
    weight: s.weight != null ? Number.parseFloat(s.weight) : null,
    reps: s.reps,
    rir: s.rir,
    rpe: s.rpe != null ? Number(s.rpe) : null,
    velocity: s.velocity,
    stickingPoint: s.stickingPoint,
    isWarmup: s.isWarmup,
    pauseQuality: s.pauseQuality,
    touchPoint: s.touchPoint,
    trajectoryQuality: s.trajectoryQuality,
    techniqueSigns: s.techniqueSigns,
    painScore: s.painScore,
    symptoms: s.symptoms,
    videoUrl: s.videoUrl,
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
