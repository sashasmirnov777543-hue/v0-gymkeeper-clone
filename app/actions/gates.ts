"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  sessionGateDecisions,
  sessions,
  workouts,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/require-auth";
import {
  decideConditionalHeavySingle,
  type V9CycleNumber,
  type WorkoutSlot,
} from "@/lib/program/gates";
import type { ReadinessLevel } from "@/lib/readiness";

export async function evaluateConditionalSingle(input: {
  sessionId: number;
  medicalClearanceForPlannedLoadAndStraining: boolean;
  spotterPresent: boolean;
  safetiesSet: boolean;
  warmupSafe: boolean;
  expectedRpe: number;
}) {
  await requireAuth();
  const [row] = await db
    .select({
      block: cycles.block,
      cycle: cycles.number,
      slot: workouts.label,
      readiness: sessions.readinessLevel,
      redFlags: sessions.redFlags,
      status: sessions.status,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .where(eq(sessions.id, input.sessionId))
    .limit(1);
  if (!row || row.status !== "active") throw new Error("Активная сессия не найдена");
  if (row.block !== "v9" || row.cycle < 1 || row.cycle > 13) {
    throw new Error("Условный сингл не предусмотрен в этой сессии");
  }
  const redFlagSymptoms = Boolean(
    row.redFlags &&
      typeof row.redFlags === "object" &&
      Object.values(row.redFlags as Record<string, unknown>).some(Boolean),
  );
  const decision = decideConditionalHeavySingle({
    cycle: row.cycle as V9CycleNumber,
    slot: row.slot as WorkoutSlot,
    readiness: (row.readiness ?? "red") as ReadinessLevel,
    redFlagSymptoms,
    ...input,
  });
  await db.insert(sessionGateDecisions).values({
    sessionId: input.sessionId,
    gate: "conditional_heavy_single",
    allowed: decision.allowed,
    inputs: input,
    reasons: decision.allowed ? [] : decision.reasons,
  });
  return decision;
}
