"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  programState,
  sessionGateDecisions,
  sessions,
  workouts,
} from "@/lib/db/schema";
import {
  DEFAULT_CLEARANCE_LEVEL,
  clearanceAllowsSingles,
  isClearanceLevel,
} from "@/lib/program/version";
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
  clearanceLevel?: "level_1" | "level_2" | "level_3";
  plannedPercentOfRmref?: number;
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
  // Редакция 2.0: сингловая работа существует только в B2 циклов V9-8, V9-10 и V9-12.
  if (row.block !== "v9" || row.cycle < 1 || row.cycle > 13) {
    throw new Error("Условный сингл не предусмотрен в этой сессии");
  }
  const redFlagSymptoms = Boolean(
    row.redFlags &&
      typeof row.redFlags === "object" &&
      Object.values(row.redFlags as Record<string, unknown>).some(Boolean),
  );
  // Уровень допуска берётся из состояния программы на сервере, а не из формы:
  // клиент не должен иметь возможности объявить себя допущенным.
  const [state] = await db
    .select({ clearanceLevel: programState.clearanceLevel })
    .from(programState)
    .where(eq(programState.profileKey, "primary"))
    .limit(1);
  const storedLevel = isClearanceLevel(state?.clearanceLevel)
    ? state.clearanceLevel
    : DEFAULT_CLEARANCE_LEVEL;
  const decision = decideConditionalHeavySingle({
    cycle: row.cycle as V9CycleNumber,
    slot: row.slot as WorkoutSlot,
    readiness: (row.readiness ?? "red") as ReadinessLevel,
    redFlagSymptoms,
    ...input,
    clearanceLevel: storedLevel,
    medicalClearanceForPlannedLoadAndStraining:
      input.medicalClearanceForPlannedLoadAndStraining &&
      clearanceAllowsSingles(storedLevel),
  });
  await db.insert(sessionGateDecisions).values({
    sessionId: input.sessionId,
    gate: "conditional_heavy_single",
    allowed: decision.allowed,
    inputs: { ...input, clearanceLevel: storedLevel },
    reasons: decision.allowed ? [] : decision.reasons,
  });
  return decision;
}
