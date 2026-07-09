"use server";

import { db } from "@/lib/db";
import {
  appSettings,
  cycles,
  workouts,
  workoutExercises,
  sessions,
  loggedSets,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyAmrapTmRecalc } from "@/lib/tm-recalc";
import { ensureSchema } from "@/lib/db/migrate";
import { readinessLevel, type ReadinessInput } from "@/lib/training-logic";

export async function startSession(
  workoutId: number,
  readiness?: ReadinessInput,
) {
  await ensureSchema();
  // если уже есть активная сессия этой тренировки — продолжаем её
  const existing = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.workoutId, workoutId), eq(sessions.status, "active")),
    )
    .limit(1);

  if (existing.length > 0) {
    redirect(`/session/${existing[0].id}`);
  }

  const recent = readiness
    ? []
    : await db
        .select({ readinessLevel: sessions.readinessLevel })
        .from(sessions)
        .orderBy(desc(sessions.startedAt))
        .limit(20);
  const inheritedReadiness =
    recent.find((row) => row.readinessLevel)?.readinessLevel ?? null;
  const inserted = await db
    .insert(sessions)
    .values({
      workoutId,
      ...(readiness
        ? { ...readiness, readinessLevel: readinessLevel(readiness) }
        : { readinessLevel: inheritedReadiness }),
    })
    .onConflictDoNothing()
    .returning({ id: sessions.id });

  if (inserted.length === 0) {
    const [winner] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(eq(sessions.workoutId, workoutId), eq(sessions.status, "active")),
      )
      .limit(1);
    if (winner) redirect(`/session/${winner.id}`);
    throw new Error("Не удалось создать сессию");
  }

  redirect(`/session/${inserted[0].id}`);
}

export async function logSet(input: {
  sessionId: number;
  workoutExerciseId: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  velocity: "fast" | "normal" | "slow";
  stickingPoint: "chest" | "middle" | "lockout" | null;
}) {
  const inserted = await db
    .insert(loggedSets)
    .values({
      sessionId: input.sessionId,
      workoutExerciseId: input.workoutExerciseId,
      setNumber: input.setNumber,
      weight: input.weight != null ? String(input.weight) : null,
      reps: input.reps,
      rir: input.rir,
      velocity: input.velocity,
      stickingPoint: input.stickingPoint,
    })
    .returning({ id: loggedSets.id });
  revalidatePath(`/session/${input.sessionId}`);
  return { id: inserted[0].id };
}

export async function deleteSet(setId: number, sessionId: number) {
  await db.delete(loggedSets).where(eq(loggedSets.id, setId));
  revalidatePath(`/session/${sessionId}`);
}

export async function finishSession(sessionId: number, proposedTm?: number) {
  await db
    .update(sessions)
    .set({ status: "completed", finishedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  // если в сессии был AMRAP — автоматически пересчитываем ТМ следующего макро
  const recalc = await applyAmrapTmRecalc(sessionId, { proposedTm });

  revalidatePath("/");
  revalidatePath("/history");
  if (recalc) {
    const q = new URLSearchParams({
      tmMacro: String(recalc.macro),
      newTm: String(recalc.newTm),
      oldTm: recalc.oldTm != null ? String(recalc.oldTm) : "",
      e1rm: String(recalc.e1rm),
      amrap: `${recalc.amrapWeight}x${recalc.amrapReps}`,
    });
    redirect(`/history?${q.toString()}`);
  }
  redirect("/history");
}

export async function cancelSession(sessionId: number) {
  await db.delete(loggedSets).where(eq(loggedSets.sessionId, sessionId));
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  revalidatePath("/");
  redirect("/");
}

/** Сохранение заметки к тренировке (самочувствие, нюансы) */
export async function saveSessionNotes(sessionId: number, notes: string) {
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
}) {
  await db
    .update(loggedSets)
    .set({
      weight: input.weight != null ? String(input.weight) : null,
      reps: input.reps,
      rir: input.rir,
    })
    .where(eq(loggedSets.id, input.setId));
  revalidatePath(`/session/${input.sessionId}`);
}

/** Завершение кардио-сессии: пишем длительность, средний пульс, скорость и сопротивление */
export async function finishCardioSession(input: {
  sessionId: number;
  durationSeconds: number;
  avgHr: number | null;
  speed?: string | null;
  resistance?: string | null;
}) {
  await ensureSchema();
  await db
    .update(sessions)
    .set({
      status: "completed",
      finishedAt: new Date(),
      durationSeconds: input.durationSeconds,
      avgHr: input.avgHr,
      cardioSpeed: input.speed ?? null,
      cardioResistance: input.resistance ?? null,
    })
    .where(eq(sessions.id, input.sessionId));
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

/** Переключение активного программного блока (V9 / H2) */
export async function setActiveBlock(block: "v9" | "h2") {
  await db
    .insert(appSettings)
    .values({ key: "active_block", value: block })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: block },
    });
  revalidatePath("/");
}
