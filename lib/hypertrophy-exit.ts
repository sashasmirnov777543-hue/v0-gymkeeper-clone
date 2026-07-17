import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";

/** Максимум циклов гипертрофийного блока до принудительного перехода в силовой. */
export const H2_MAX_CYCLES = 5;

export type CycleTonnage = { cycleNumber: number; tonnage: number };

export type HypertrophyBlockStatus = {
  exhausted: boolean;
  reason: "max-cycles" | "no-growth" | null;
  completedCycles: number;
  tonnageByCycle: CycleTonnage[];
};

/** Жимовое упражнение (для подсчёта тоннажа блока H2). */
export function isPressingExercise(name: string): boolean {
  return /жим/i.test(name);
}

const EMPTY: HypertrophyBlockStatus = {
  exhausted: false,
  reason: null,
  completedCycles: 0,
  tonnageByCycle: [],
};

/**
 * Суммарный тоннаж жимовых упражнений по завершённым циклам блока H2.
 * Блок исчерпан, если: завершено >= H2_MAX_CYCLES циклов,
 * либо 2 цикла подряд нет роста тоннажа.
 */
export async function hypertrophyBlockStatus(): Promise<HypertrophyBlockStatus> {
  const h2Cycles = await db
    .select({ id: cycles.id, number: cycles.number })
    .from(cycles)
    .where(eq(cycles.block, "h2"));
  if (h2Cycles.length === 0) return EMPTY;
  const cycleById = new Map(h2Cycles.map((c) => [c.id, c.number]));

  const h2Workouts = await db
    .select({ id: workouts.id, cycleId: workouts.cycleId })
    .from(workouts)
    .where(
      and(
        inArray(workouts.cycleId, h2Cycles.map((c) => c.id)),
        eq(workouts.kind, "strength"),
      ),
    );
  if (h2Workouts.length === 0) return EMPTY;
  const workoutCycle = new Map(h2Workouts.map((w) => [w.id, w.cycleId]));

  const completed = await db
    .select({ id: sessions.id, workoutId: sessions.workoutId })
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "completed"),
        inArray(sessions.workoutId, h2Workouts.map((w) => w.id)),
      ),
    );
  if (completed.length === 0) return EMPTY;
  const sessionCycle = new Map(
    completed.map((s) => [s.id, workoutCycle.get(s.workoutId)!]),
  );

  const setRows = await db
    .select({
      sessionId: loggedSets.sessionId,
      exerciseName: workoutExercises.name,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
    })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .where(inArray(loggedSets.sessionId, completed.map((s) => s.id)));

  const tonnageByCycleId = new Map<number, number>();
  for (const s of setRows) {
    if (!isPressingExercise(s.exerciseName)) continue;
    const w = s.weight == null ? 0 : Number.parseFloat(s.weight);
    const cycleId = sessionCycle.get(s.sessionId);
    if (cycleId == null || w <= 0 || !s.reps) continue;
    tonnageByCycleId.set(
      cycleId,
      (tonnageByCycleId.get(cycleId) ?? 0) + w * s.reps,
    );
  }

  const tonnageByCycle: CycleTonnage[] = [...tonnageByCycleId.entries()]
    .map(([cycleId, tonnage]) => ({
      cycleNumber: cycleById.get(cycleId) ?? 0,
      tonnage: Math.round(tonnage),
    }))
    .sort((a, b) => a.cycleNumber - b.cycleNumber);

  const completedCycles = tonnageByCycle.length;

  if (completedCycles >= H2_MAX_CYCLES) {
    return {
      exhausted: true,
      reason: "max-cycles",
      completedCycles,
      tonnageByCycle,
    };
  }

  // 2 цикла подряд без роста: оба последних сравнения тоннажа <= 0
  if (completedCycles >= 3) {
    const t = tonnageByCycle;
    const lastDelta = t[t.length - 1].tonnage - t[t.length - 2].tonnage;
    const prevDelta = t[t.length - 2].tonnage - t[t.length - 3].tonnage;
    if (lastDelta <= 0 && prevDelta <= 0) {
      return {
        exhausted: true,
        reason: "no-growth",
        completedCycles,
        tonnageByCycle,
      };
    }
  }

  return { exhausted: false, reason: null, completedCycles, tonnageByCycle };
}
