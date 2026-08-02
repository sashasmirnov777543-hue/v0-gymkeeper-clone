"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  programState,
  recoveryInsertions,
  rhrMeasurements,
  rmrefReviewEvents,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { reviewRmrefUpdate, rmrefFromCalibrationTriple } from "@/lib/program/rmref";
import { isClearanceLevel } from "@/lib/program/version";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function setProgramStartDate(form: FormData) {
  await requireAuth();
  const startDate = text(form, "startDate");
  if (!DATE_RE.test(startDate) || Number.isNaN(Date.parse(`${startDate}T00:00:00Z`))) {
    throw new Error("Некорректная дата старта");
  }
  await db
    .update(programState)
    .set({ startDate, currentProgramDay: 1, updatedAt: new Date() })
    .where(eq(programState.profileKey, "primary"));
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function setCurrentProgramDay(form: FormData) {
  await requireAuth();
  const day = Number(text(form, "programDay"));
  if (!Number.isInteger(day) || day < 1 || day > 176) {
    throw new Error("День программы должен быть от 1 до 176");
  }
  await db
    .update(programState)
    .set({ currentProgramDay: day, updatedAt: new Date() })
    .where(eq(programState.profileKey, "primary"));
  revalidatePath("/");
}

export async function setTestDate(form: FormData) {
  await requireAuth();
  const testDate = text(form, "testDate");
  if (testDate && (!DATE_RE.test(testDate) || Number.isNaN(Date.parse(`${testDate}T00:00:00Z`)))) {
    throw new Error("Некорректная дата теста");
  }
  await db
    .update(programState)
    .set({ testDate: testDate || null, updatedAt: new Date() })
    .where(eq(programState.profileKey, "primary"));
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function saveRhrMeasurement(form: FormData) {
  await requireAuth();
  const measuredOn = text(form, "measuredOn");
  const bpm = Number(text(form, "bpm"));
  const repeatedRaw = text(form, "repeatedBpm");
  const repeatedBpm = repeatedRaw ? Number(repeatedRaw) : null;
  const comparable = form.get("comparable") === "on";
  const poorWellbeing = form.get("poorWellbeing") === "on";
  const notes = text(form, "notes") || null;
  if (!DATE_RE.test(measuredOn)) throw new Error("Некорректная дата RHR");
  if (!Number.isInteger(bpm) || bpm < 30 || bpm > 220) throw new Error("RHR должен быть от 30 до 220");
  if (repeatedBpm != null && (!Number.isInteger(repeatedBpm) || repeatedBpm < 30 || repeatedBpm > 220)) {
    throw new Error("Повторный RHR должен быть от 30 до 220");
  }
  await db
    .insert(rhrMeasurements)
    .values({ measuredOn, bpm, repeatedBpm, comparable, poorWellbeing, notes })
    .onConflictDoUpdate({
      target: rhrMeasurements.measuredOn,
      set: { bpm, repeatedBpm, comparable, poorWellbeing, notes },
    });
  revalidatePath("/");
  revalidatePath("/stats");
}

export async function addRecoveryDays(form: FormData) {
  await requireAuth();
  const afterProgramDay = Number(text(form, "afterProgramDay"));
  const days = Number(text(form, "days"));
  const reason = text(form, "reason") || null;
  if (!Number.isInteger(afterProgramDay) || afterProgramDay < 1 || afterProgramDay > 176) {
    throw new Error("Некорректная точка вставки восстановления");
  }
  if (!Number.isInteger(days) || days < 1 || days > 4) {
    throw new Error("Можно добавить от 1 до 4 дней");
  }
  await db
    .insert(recoveryInsertions)
    .values({ afterProgramDay, days, reason })
    .onConflictDoUpdate({
      target: recoveryInsertions.afterProgramDay,
      set: { days, reason },
    });
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function reviewAndApplyRmref(form: FormData) {
  await requireAuth();
  const checkpoint = text(form, "checkpoint");
  // Редакция 2.0: RMref выводится из калибровочной тройки (вес ÷ 0,863, вниз до 2,5 кг).
  // Явно введённый RMref принимается только как поправка в пределах коридора ±5 кг.
  const calibrationTripleRaw = form.get("calibrationTripleKg");
  const calibrationTripleKg =
    calibrationTripleRaw === null || String(calibrationTripleRaw).trim() === ""
      ? null
      : Number(calibrationTripleRaw);
  const explicitRmref = Number(text(form, "proposedRmrefKg"));
  const proposedRmrefKg =
    calibrationTripleKg !== null && Number.isFinite(calibrationTripleKg) && calibrationTripleKg > 0
      ? rmrefFromCalibrationTriple(calibrationTripleKg)
      : explicitRmref;
  const firstSessionId = text(form, "firstSessionId");
  const secondSessionId = text(form, "secondSessionId");
  const [state] = await db
    .select()
    .from(programState)
    .where(eq(programState.profileKey, "primary"))
    .limit(1);
  const currentRmrefKg = Number(state?.rmrefKg ?? 115);
  // Стандартизированная тройка сама является подтверждением: она снята
  // по единому протоколу, поэтому одной сопоставимой калибровки достаточно.
  const evidence = [
    {
      sessionId: firstSessionId,
      comparableTechnique: form.get("firstTechnique") === "on",
      comparablePause: form.get("firstPause") === "on",
      comparableTouchPoint: form.get("firstTouch") === "on",
      improvementConfirmed: form.get("firstImproved") === "on",
    },
    {
      sessionId: secondSessionId,
      comparableTechnique: form.get("secondTechnique") === "on",
      comparablePause: form.get("secondPause") === "on",
      comparableTouchPoint: form.get("secondTouch") === "on",
      improvementConfirmed: form.get("secondImproved") === "on",
    },
  ];
  const decision = reviewRmrefUpdate({
    checkpoint,
    currentRmrefKg,
    proposedRmrefKg,
    evidence,
  });
  await db.transaction(async (tx) => {
    await tx.insert(rmrefReviewEvents).values({
      checkpoint,
      previousRmrefKg: String(currentRmrefKg),
      proposedRmrefKg: String(proposedRmrefKg),
      status: decision.allowed ? "applied" : "rejected",
      evidence,
      reasons: decision.reasons,
      decidedAt: new Date(),
    });
    if (decision.allowed) {
      await tx
        .update(programState)
        .set({ rmrefKg: String(decision.nextRmrefKg), updatedAt: new Date() })
        .where(eq(programState.profileKey, "primary"));
    }
  });
  revalidatePath("/");
  revalidatePath("/settings");
}


/**
 * Уровень медицинского допуска редакции 2.0.
 * Определяет потолок интенсивности и доступность синглов и прямого 1ПМ.
 * Меняется только по итогам разговора с врачом, а не по самочувствию.
 */
export async function setClearanceLevel(form: FormData) {
  await requireAuth();
  const value = text(form, "clearanceLevel");
  if (!isClearanceLevel(value)) {
    throw new Error("Некорректный уровень допуска");
  }
  await db
    .insert(programState)
    .values({ profileKey: "primary", clearanceLevel: value })
    .onConflictDoUpdate({
      target: programState.profileKey,
      set: { clearanceLevel: value, updatedAt: new Date() },
    });
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/settings/");
}
