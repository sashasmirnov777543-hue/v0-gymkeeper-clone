"use server";

import { db } from "@/lib/db";
import {
  coachProposals,
  cycles,
  workouts,
  workoutExercises,
  sessions,
  loggedSets,
  programState,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureSchema } from "@/lib/db/migrate";
import { assessReadiness, type ReadinessInput } from "@/lib/readiness";
import {
  createStartSnapshot,
  guardSet,
  updateSafetyFromFacts,
  validateSetNumbers,
  type StartSelection,
} from "@/lib/program/server";
import { requireAuth } from "@/lib/require-auth";

export async function startSession(
  workoutId: number,
  readiness: ReadinessInput,
  testSelection?: StartSelection,
) {
  await requireAuth();
  await ensureSchema();
  if (assessReadiness(readiness).level === "red")
    throw new Error("Красный статус: ни нагрузки, ни разминки.");
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, "active"))
    .limit(1);
  if (existing[0]) redirect(`/session/${existing[0].id}`);
  const [workout] = await db
    .select({ programKey: workouts.programKey })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1);
  const [proposal] = workout?.programKey
    ? await db
        .select()
        .from(coachProposals)
        .where(
          and(
            eq(coachProposals.target, workout.programKey),
            eq(coachProposals.status, "applied"),
          ),
        )
        .orderBy(desc(coachProposals.appliedAt))
        .limit(1)
    : [];
  const adjustment =
    proposal &&
    (!proposal.expiresAt || proposal.expiresAt.getTime() >= Date.now())
      ? proposal
      : null;
  const prepared = await createStartSnapshot(
    workoutId,
    readiness,
    testSelection,
    db,
    false,
    (adjustment?.patch ?? {}) as Record<string, unknown>,
  );
  const inserted = await db
    .insert(sessions)
    .values({
      workoutId,
      programVersion: prepared.version,
      testBranch: prepared.branch,
      sleepMinutes: readiness.sleepMinutes,
      sleepQuality: readiness.sleepQuality,
      shoulderPain: readiness.shoulderPain,
      backPain: readiness.backPain,
      energy: readiness.energy,
      morningPulseDelta:
        readiness.restingHeartRateTrend?.deltaFromBaselineBpm != null
          ? Math.round(readiness.restingHeartRateTrend.deltaFromBaselineBpm)
          : null,
      readinessLevel: prepared.assessment.level,
      readinessInput: readiness,
      readinessReasons: prepared.assessment.reasonCodes,
      adaptationPlan: {
        readiness: prepared.assessment.permittedAction,
        coachAdjustment: adjustment,
        revision30: prepared.snapshot,
      },
      redFlags: readiness.clinicalStopFlags ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: sessions.id });
  if (!inserted[0]) {
    const [active] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.status, "active"))
      .limit(1);
    if (active) redirect(`/session/${active.id}`);
    throw new Error("Не удалось создать сессию.");
  }
  redirect(`/session/${inserted[0].id}`);
}

async function assertSetBelongsToSession(setId: number, sessionId: number) {
  const [row] = await db
    .select({ id: loggedSets.id })
    .from(loggedSets)
    .where(and(eq(loggedSets.id, setId), eq(loggedSets.sessionId, sessionId)))
    .limit(1);
  if (!row) throw new Error("Подход не принадлежит сессии");
}

export async function logSet(input: {
  sessionId: number;
  workoutExerciseId: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  velocity: "fast" | "normal" | "slow" | null;
  stickingPoint: "chest" | "middle" | "lockout" | null;
  isWarmup?: boolean;
  pauseQuality?: "clean" | "short" | "lost" | null;
  touchPoint?: "stable" | "high" | "low" | "variable" | null;
  trajectoryQuality?: "clean" | "asymmetric" | "deviated" | null;
  techniqueSigns?: string[];
  painScore?: number | null;
  symptoms?: string[];
  videoUrl?: string | null;
}) {
  await requireAuth();
  if (
    !Number.isInteger(input.setNumber) ||
    input.setNumber < 1 ||
    input.setNumber > 30
  ) {
    throw new Error("Некорректный номер подхода");
  }
  if (
    input.weight != null &&
    (!Number.isFinite(input.weight) || input.weight < 0 || input.weight > 500)
  ) {
    throw new Error("Некорректный вес");
  }
  if (
    input.reps != null &&
    (!Number.isInteger(input.reps) || input.reps < 0 || input.reps > 100)
  ) {
    throw new Error("Некорректные повторения");
  }
  if (
    input.rir != null &&
    (!Number.isInteger(input.rir) || input.rir < 0 || input.rir > 10)
  ) {
    throw new Error("RIR должен быть от 0 до 10");
  }
  if (
    input.rpe != null &&
    (!Number.isFinite(input.rpe) || input.rpe < 0 || input.rpe > 10)
  ) {
    throw new Error("RPE должен быть от 0 до 10");
  }
  if (
    input.painScore != null &&
    (!Number.isInteger(input.painScore) ||
      input.painScore < 0 ||
      input.painScore > 10)
  ) {
    throw new Error("Боль должна быть от 0 до 10");
  }
  const saved = await db.transaction(async (tx) => {
    validateSetNumbers(input);
    await guardSet(tx, input.sessionId, input.workoutExerciseId, input);
    const inserted = await tx
      .insert(loggedSets)
      .values({
        sessionId: input.sessionId,
        workoutExerciseId: input.workoutExerciseId,
        setNumber: input.setNumber,
        weight: input.weight != null ? String(input.weight) : null,
        reps: input.reps,
        rir: input.rir,
        rpe: input.rpe != null ? String(input.rpe) : null,
        velocity: input.velocity,
        stickingPoint: input.stickingPoint,
        isWarmup: input.isWarmup ?? false,
        pauseQuality: input.pauseQuality ?? null,
        touchPoint: input.touchPoint ?? null,
        trajectoryQuality: input.trajectoryQuality ?? null,
        techniqueSigns: input.techniqueSigns ?? [],
        painScore: input.painScore ?? null,
        symptoms: input.symptoms ?? [],
        videoUrl: input.videoUrl?.trim() || null,
      })
      .returning({ id: loggedSets.id });
    if (
      input.symptoms?.some((value) =>
        [
          "medical_symptom",
          "pain_changes_movement",
          "unsafe_loss_of_control",
        ].includes(value),
      )
    ) {
      await tx
        .update(sessions)
        .set({ safetyStopped: true })
        .where(eq(sessions.id, input.sessionId));
    }
    await updateSafetyFromFacts(tx, input.sessionId);
    return { id: inserted[0].id };
  });
  revalidatePath(`/session/${input.sessionId}`);
  return saved;
}

export async function deleteSet(setId: number, sessionId: number) {
  await requireAuth();
  await assertSetBelongsToSession(setId, sessionId);
  await db
    .delete(loggedSets)
    .where(and(eq(loggedSets.id, setId), eq(loggedSets.sessionId, sessionId)));
  revalidatePath(`/session/${sessionId}`);
}

export async function finishSession(sessionId: number) {
  await requireAuth();
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(sessions)
      .set({ status: "completed", finishedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, "active")))
      .returning({ id: sessions.id, workoutId: sessions.workoutId });
    if (!changed.length) throw new Error("Сессия уже завершена или не найдена");
    const [position] = await tx
      .select({ dayOffset: cycles.dayOffset, dayInCycle: workouts.dayInCycle })
      .from(workouts)
      .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
      .where(eq(workouts.id, changed[0].workoutId))
      .limit(1);
    if (position?.dayOffset != null && position.dayInCycle != null) {
      const nextDay = Math.min(
        176,
        position.dayOffset + position.dayInCycle + 1,
      );
      await tx
        .update(programState)
        .set({
          currentProgramDay: sql`greatest(${programState.currentProgramDay}, ${nextDay})`,
          updatedAt: new Date(),
        })
        .where(eq(programState.profileKey, "primary"));
    }
  });

  revalidatePath("/");
  revalidatePath("/history");
  redirect("/history");
}

export async function cancelSession(sessionId: number) {
  await requireAuth();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM sessions WHERE id=${sessionId} FOR UPDATE`,
    );
    const [active] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, "active")))
      .limit(1);
    if (!active)
      throw new Error(
        "Можно отменить только активную сессию. История сохранена.",
      );
    await tx.delete(loggedSets).where(eq(loggedSets.sessionId, sessionId));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, "active")));
  });
  revalidatePath("/");
  redirect("/");
}

/** Сохранение заметки к тренировке (самочувствие, нюансы) */
export async function saveSessionNotes(sessionId: number, notes: string) {
  await requireAuth();
  await db
    .update(sessions)
    .set({ notes: notes.trim() || null })
    .where(eq(sessions.id, sessionId));
  revalidatePath(`/session/${sessionId}`);
  revalidatePath("/history");
}

/** Редактирование записанного подхода */
export async function updateSet(input: {
  setId: number;
  sessionId: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
}) {
  await requireAuth();
  validateSetNumbers(input);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM sessions WHERE id=${input.sessionId} FOR UPDATE`,
    );
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .limit(1);
    const [set] = await tx
      .select()
      .from(loggedSets)
      .where(
        and(
          eq(loggedSets.id, input.setId),
          eq(loggedSets.sessionId, input.sessionId),
        ),
      )
      .limit(1);
    if (!session || session.status !== "active" || !set)
      throw new Error(
        "Изменять можно только собственный подход активной сессии.",
      );
    if (
      !session.adaptationPlan ||
      typeof session.adaptationPlan !== "object" ||
      !("revision30" in session.adaptationPlan)
    )
      throw new Error(
        "История предыдущей редакции доступна только для чтения.",
      );
    await tx
      .update(loggedSets)
      .set({
        weight: input.weight != null ? String(input.weight) : null,
        reps: input.reps,
        rir: input.rir,
        ...(input.rpe !== undefined
          ? { rpe: input.rpe != null ? String(input.rpe) : null }
          : {}),
      })
      .where(
        and(
          eq(loggedSets.id, input.setId),
          eq(loggedSets.sessionId, input.sessionId),
        ),
      );
    await updateSafetyFromFacts(tx, input.sessionId);
  });
  revalidatePath(`/session/${input.sessionId}`);
}

/** Завершение кардио-сессии: пишем длительность, средний пульс, скорость и сопротивление */
export async function finishCardioSession(input: {
  sessionId: number;
  durationSeconds: number;
  avgHr: number | null;
  speed?: string | null;
  resistance?: string | null;
  modality?: string | null;
  warmupMinutes?: number | null;
  mainMinutes?: number | null;
  cooldownMinutes?: number | null;
  supportLog?: { completedIds: number[]; mode: number };
  cardioRpe: number | null;
  cardioTalkTest: "full_sentences" | "short_phrases" | "difficult" | null;
  cardioSymptoms?: string | null;
}) {
  await requireAuth();
  await ensureSchema();
  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < 0 ||
    input.durationSeconds > 86400
  ) {
    throw new Error("Некорректная длительность кардио");
  }
  if (
    input.cardioRpe != null &&
    (!Number.isInteger(input.cardioRpe) ||
      input.cardioRpe < 1 ||
      input.cardioRpe > 10)
  ) {
    throw new Error("RPE кардио должен быть от 1 до 10");
  }
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(sessions)
      .set({
        status: "completed",
        finishedAt: new Date(),
        durationSeconds: input.durationSeconds,
        avgHr: input.avgHr,
        cardioSpeed: input.speed ?? null,
        cardioResistance: input.resistance ?? null,
        cardioModality: input.modality ?? null,
        cardioWarmupMinutes: input.warmupMinutes ?? null,
        cardioMainMinutes: input.mainMinutes ?? null,
        cardioCooldownMinutes: input.cooldownMinutes ?? null,
        cardioRpe: input.cardioRpe,
        cardioTalkTest: input.cardioTalkTest,
        cardioSymptoms: input.cardioSymptoms?.trim() || null,
        supportLog: input.supportLog ?? null,
      })
      .where(
        and(eq(sessions.id, input.sessionId), eq(sessions.status, "active")),
      )
      .returning({ workoutId: sessions.workoutId });
    if (!changed.length) throw new Error("Кардио уже завершено или не найдено");
    const [position] = await tx
      .select({ dayOffset: cycles.dayOffset, dayInCycle: workouts.dayInCycle })
      .from(workouts)
      .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
      .where(eq(workouts.id, changed[0].workoutId))
      .limit(1);
    if (position?.dayOffset != null && position.dayInCycle != null) {
      const nextDay = Math.min(
        176,
        position.dayOffset + position.dayInCycle + 1,
      );
      await tx
        .update(programState)
        .set({
          currentProgramDay: sql`greatest(${programState.currentProgramDay}, ${nextDay})`,
          updatedAt: new Date(),
        })
        .where(eq(programState.profileKey, "primary"));
    }
  });
  revalidatePath("/");
  revalidatePath("/history");
}

/**
 * Прошлая кардио-тренировка того же типа (по названию тренировки):
 * скорость, сопротивление, длительность и средний пульс последней
 * завершённой сессии. Нужна, чтобы показать прошлые значения.
 */
export async function getLastCardioSession(
  workoutTitle: string,
  excludeSessionId: number,
) {
  await ensureSchema();
  const rows = await db
    .select({
      speed: sessions.cardioSpeed,
      resistance: sessions.cardioResistance,
      durationSeconds: sessions.durationSeconds,
      avgHr: sessions.avgHr,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .where(
      and(
        eq(workouts.title, workoutTitle),
        eq(sessions.status, "completed"),
        ne(sessions.id, excludeSessionId),
      ),
    )
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Последние выполненные подходы по каждому упражнению (по имени упражнения,
 * чтобы рекомендации переносились между циклами).
 * Возвращает: имя упражнения -> подходы последней завершённой сессии.
 */
export async function getLastSetsByExerciseNames(names: string[]) {
  if (names.length === 0) return {};

  const rows = await db
    .select({
      name: workoutExercises.name,
      sessionId: loggedSets.sessionId,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
      rir: loggedSets.rir,
      startedAt: sessions.startedAt,
    })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.status, "completed"),
        eq(loggedSets.isWarmup, false),
        inArray(workoutExercises.name, names),
      ),
    )
    .orderBy(desc(sessions.startedAt), loggedSets.id);

  const result: Record<
    string,
    { weight: number | null; reps: number | null; rir: number | null }[]
  > = {};
  const latestSession: Record<string, number> = {};

  for (const r of rows) {
    if (!(r.name in latestSession)) {
      latestSession[r.name] = r.sessionId;
      result[r.name] = [];
    }
    if (latestSession[r.name] === r.sessionId) {
      result[r.name].push({
        weight: r.weight != null ? Number.parseFloat(r.weight) : null,
        reps: r.reps,
        rir: r.rir,
      });
    }
  }
  return result;
}

/**
 * История упражнения по имени: для последних N завершённых сессий —
 * лучший рабочий подход (максимальный вес, при равенстве больше повторов).
 * Для мини-графика прогресса в карточке упражнения.
 */
export async function getExerciseHistory(name: string, limit = 6) {
  const rows = await db
    .select({
      sessionId: loggedSets.sessionId,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
      startedAt: sessions.startedAt,
    })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .where(
      and(eq(sessions.status, "completed"), eq(workoutExercises.name, name)),
    )
    .orderBy(desc(sessions.startedAt));

  // группируем по сессии, берём лучший подход
  const bySession = new Map<
    number,
    { date: string; weight: number; reps: number }
  >();
  const order: number[] = [];
  for (const r of rows) {
    const w = r.weight != null ? Number.parseFloat(r.weight) : 0;
    if (!bySession.has(r.sessionId)) {
      order.push(r.sessionId);
      bySession.set(r.sessionId, {
        date: r.startedAt.toISOString(),
        weight: w,
        reps: r.reps ?? 0,
      });
    } else {
      const cur = bySession.get(r.sessionId)!;
      if (w > cur.weight || (w === cur.weight && (r.reps ?? 0) > cur.reps)) {
        cur.weight = w;
        cur.reps = r.reps ?? 0;
      }
    }
  }

  // от старых к новым, последние `limit`
  return order
    .slice(0, limit)
    .reverse()
    .map((id) => bySession.get(id)!);
}

/**
 * Последняя выполненная стандартизированная тройка — калибровочная или тестовая.
 *
 * Ищется по роли, а не по названию: тестовая тройка в Ц22 должна опираться
 * на калибровку Ц20, у которой другое название упражнения.
 */
export async function getLastStandardTriple(): Promise<{
  weightKg: number;
  rpe: number | null;
} | null> {
  const [row] = await db
    .select({
      weight: loggedSets.weight,
      rpe: loggedSets.rpe,
    })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.status, "completed"),
        inArray(workoutExercises.role, ["calibration", "test_triple"]),
      ),
    )
    .orderBy(desc(sessions.startedAt), desc(loggedSets.id))
    .limit(1);
  if (!row?.weight) return null;
  const weightKg = Number.parseFloat(row.weight);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  return { weightKg, rpe: row.rpe != null ? Number(row.rpe) : null };
}
