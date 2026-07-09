import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import {
  appSettings,
  cycles,
  loggedSets,
  sessions,
  tmRecalcEvents,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import {
  manualTrainingMaxPlan,
  recalcExerciseWeightText,
  trainingMaxFromAmrap,
} from "@/lib/training-logic";

export type TmRecalcResult = {
  macro: number;
  oldTm: number | null;
  newTm: number;
  amrapWeight: number;
  amrapReps: number;
  e1rm: number;
  updatedExercises: number;
  alreadyApplied?: boolean;
};

type TmTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function eventToResult(
  row: typeof tmRecalcEvents.$inferSelect,
): TmRecalcResult {
  return {
    macro: row.targetMacro,
    oldTm: row.oldTm == null ? null : Number.parseFloat(row.oldTm),
    newTm: Number.parseFloat(row.newTm),
    amrapWeight: Number.parseFloat(row.amrapWeight),
    amrapReps: row.amrapReps,
    e1rm: Number.parseFloat(row.e1rm),
    updatedExercises: row.updatedExercises,
    alreadyApplied: true,
  };
}

async function updateMacroExercises(
  tx: Pick<typeof db, "select" | "insert" | "update">,
  macro: number,
  newTm: number,
  freshE1rm = newTm / 0.9,
): Promise<number> {
  const macroCycles = await tx
    .select({ id: cycles.id })
    .from(cycles)
    .where(and(eq(cycles.macrocycle, macro), eq(cycles.block, "v9")));
  const cycleIds = macroCycles.map((row) => row.id);
  if (cycleIds.length === 0) return 0;

  const macroWorkouts = await tx
    .select({ id: workouts.id })
    .from(workouts)
    .where(inArray(workouts.cycleId, cycleIds));
  const workoutIds = macroWorkouts.map((row) => row.id);
  if (workoutIds.length === 0) return 0;

  const exercises = await tx
    .select({
      id: workoutExercises.id,
      name: workoutExercises.name,
      weightText: workoutExercises.weightText,
    })
    .from(workoutExercises)
    .where(inArray(workoutExercises.workoutId, workoutIds));

  let updated = 0;
  for (const exercise of exercises) {
    if (!exercise.weightText) continue;
    const next = recalcExerciseWeightText(
      exercise.name,
      exercise.weightText,
      newTm,
      freshE1rm,
    );
    if (next !== exercise.weightText) {
      await tx
        .update(workoutExercises)
        .set({ weightText: next })
        .where(eq(workoutExercises.id, exercise.id));
      updated += 1;
    }
  }
  return updated;
}

export async function applyAmrapTmRecalc(
  sessionId: number,
  options?: { force?: boolean; proposedTm?: number },
): Promise<TmRecalcResult | null> {
  await ensureSchema();
  return db.transaction((tx) =>
    applyAmrapTmRecalcInTransaction(tx, sessionId, options),
  );
}

/** Версия для уже открытой транзакции (нужна атомарной offline-sync). */
export async function applyAmrapTmRecalcInTransaction(
  tx: TmTransaction,
  sessionId: number,
  options?: { force?: boolean; proposedTm?: number },
): Promise<TmRecalcResult | null> {
  const [existing] = await tx
    .select()
    .from(tmRecalcEvents)
    .where(eq(tmRecalcEvents.sessionId, sessionId))
    .limit(1);
  if (existing && !options?.force) return eventToResult(existing);

  const [sessionRow] = await tx
    .select({ macrocycle: cycles.macrocycle, block: cycles.block })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow || sessionRow.block !== "v9") return null;

  const targetMacro = sessionRow.macrocycle + 1;
  if (targetMacro > 3) return null;

  const amrapSets = await tx
    .select({ weight: loggedSets.weight, reps: loggedSets.reps })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .where(
      and(
        eq(loggedSets.sessionId, sessionId),
        ilike(workoutExercises.name, "%AMRAP%"),
      ),
    );

  let best: { weight: number; reps: number; e1rm: number; tm: number } | null =
    null;
  for (const set of amrapSets) {
    const weight = set.weight == null ? null : Number.parseFloat(set.weight);
    if (weight == null || weight <= 0 || set.reps == null || set.reps <= 0)
      continue;
    const calc = trainingMaxFromAmrap(weight, set.reps);
    if (!best || calc.e1rm > best.e1rm)
      best = { weight, reps: set.reps, ...calc };
  }
  if (!best) return null;

  const proposed = options?.proposedTm;
  const newTm = proposed == null ? best.tm : proposed;
  if (!Number.isFinite(newTm) || newTm <= 0) throw new Error("Некорректный TM");

  const key = `tm_macro${targetMacro}`;
  const [oldRow] = await tx
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  const oldTm = oldRow ? Number.parseFloat(oldRow.value) : null;
  await tx
    .insert(appSettings)
    .values({ key, value: String(newTm) })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(newTm) },
    });

  const updatedExercises = await updateMacroExercises(tx, targetMacro, newTm, best.e1rm);
  const event = {
    sessionId,
    targetMacro,
    oldTm: oldTm == null ? null : String(oldTm),
    newTm: String(newTm),
    amrapWeight: String(best.weight),
    amrapReps: best.reps,
    e1rm: String(Math.round(best.e1rm * 10) / 10),
    updatedExercises,
    createdAt: new Date(),
  };
  await tx.insert(tmRecalcEvents).values(event).onConflictDoUpdate({
    target: tmRecalcEvents.sessionId,
    set: event,
  });

  return {
    macro: targetMacro,
    oldTm,
    newTm,
    amrapWeight: best.weight,
    amrapReps: best.reps,
    e1rm: Math.round(best.e1rm * 10) / 10,
    updatedExercises,
  };
}

export async function applyManualTrainingMax(
  macro: number,
  newTm: number,
  freshE1rm = newTm / 0.9,
): Promise<number> {
  await ensureSchema();
  const plan = manualTrainingMaxPlan(macro, newTm);
  return db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values(plan)
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: plan.value },
      });
    return updateMacroExercises(tx, macro, newTm);
  });
}

export async function latestAmrapSessionId(): Promise<number | null> {
  await ensureSchema();
  const [row] = await db
    .select({ id: sessions.id })
    .from(loggedSets)
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .where(
      and(
        eq(sessions.status, "completed"),
        ilike(workoutExercises.name, "%AMRAP%"),
      ),
    )
    .orderBy(desc(sessions.finishedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function undoLatestTmRecalc(): Promise<{
  macro: number;
  restoredTm: number;
} | null> {
  await ensureSchema();
  const [event] = await db
    .select()
    .from(tmRecalcEvents)
    .orderBy(desc(tmRecalcEvents.createdAt))
    .limit(1);
  if (!event || event.oldTm == null) return null;
  const restoredTm = Number.parseFloat(event.oldTm);
  await applyManualTrainingMax(event.targetMacro, restoredTm);
  await db
    .delete(tmRecalcEvents)
    .where(eq(tmRecalcEvents.sessionId, event.sessionId));
  return { macro: event.targetMacro, restoredTm };
}
