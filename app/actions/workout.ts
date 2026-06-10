"use server"

import { db } from "@/lib/db"
import {
  cycles,
  workouts,
  workoutExercises,
  sessions,
  loggedSets,
} from "@/lib/db/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function startSession(workoutId: number) {
  // если уже есть активная сессия этой тренировки — продолжаем её
  const existing = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.workoutId, workoutId), eq(sessions.status, "active")))
    .limit(1)

  if (existing.length > 0) {
    redirect(`/session/${existing[0].id}`)
  }

  const inserted = await db
    .insert(sessions)
    .values({ workoutId })
    .returning({ id: sessions.id })

  redirect(`/session/${inserted[0].id}`)
}

export async function logSet(input: {
  sessionId: number
  workoutExerciseId: number
  setNumber: number
  weight: number | null
  reps: number | null
  rir: number | null
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
    })
    .returning({ id: loggedSets.id })
  revalidatePath(`/session/${input.sessionId}`)
  return { id: inserted[0].id }
}

export async function deleteSet(setId: number, sessionId: number) {
  await db.delete(loggedSets).where(eq(loggedSets.id, setId))
  revalidatePath(`/session/${sessionId}`)
}

export async function finishSession(sessionId: number) {
  await db
    .update(sessions)
    .set({ status: "completed", finishedAt: new Date() })
    .where(eq(sessions.id, sessionId))
  revalidatePath("/")
  revalidatePath("/history")
  redirect("/history")
}

export async function cancelSession(sessionId: number) {
  await db.delete(loggedSets).where(eq(loggedSets.sessionId, sessionId))
  await db.delete(sessions).where(eq(sessions.id, sessionId))
  revalidatePath("/")
  redirect("/")
}

/**
 * Последние выполненные подходы по каждому упражнению (по имени упражнения,
 * чтобы рекомендации переносились между циклами).
 * Возвращает: имя упражнения -> подходы последней завершённой сессии.
 */
export async function getLastSetsByExerciseNames(names: string[]) {
  if (names.length === 0) return {}

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
      and(eq(sessions.status, "completed"), inArray(workoutExercises.name, names)),
    )
    .orderBy(desc(sessions.startedAt), desc(loggedSets.id))

  const result: Record<
    string,
    { weight: number | null; reps: number | null; rir: number | null }[]
  > = {}
  const latestSession: Record<string, number> = {}

  for (const r of rows) {
    if (!(r.name in latestSession)) {
      latestSession[r.name] = r.sessionId
      result[r.name] = []
    }
    if (latestSession[r.name] === r.sessionId) {
      result[r.name].push({
        weight: r.weight != null ? Number.parseFloat(r.weight) : null,
        reps: r.reps,
        rir: r.rir,
      })
    }
  }
  return result
}
