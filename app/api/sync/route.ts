import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { loggedSets, sessions } from "@/lib/db/schema"
import { applyAmrapTmRecalc, type TmRecalcResult } from "@/lib/tm-recalc"

export const dynamic = "force-dynamic"

type Op =
  | { kind: "start"; localKey: string; workoutId: number; startedAt: string }
  | {
      kind: "set"
      sessionRef: number | string
      workoutExerciseId: number
      setNumber: number
      weight: number | null
      reps: number | null
      rir: number | null
    }
  | { kind: "finish"; sessionRef: number | string; finishedAt: string; proposedTm?: number }
  | { kind: "cancel"; sessionRef: number | string }
  | { kind: "deleteSet"; setId: number }

export async function POST(req: Request) {
  let ops: Op[]
  try {
    const body = (await req.json()) as { ops?: Op[] }
    ops = Array.isArray(body.ops) ? body.ops : []
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
  }

  // локальные сессии, отменённые офлайн, не создаём вовсе
  const cancelledLocal = new Set(
    ops
      .filter(
        (op): op is Extract<Op, { kind: "cancel" }> =>
          op.kind === "cancel" && typeof op.sessionRef === "string",
      )
      .map((op) => op.sessionRef as string),
  )

  // localKey -> реальный id сессии в БД
  const sessionMap = new Map<string, number>()

  // результаты пересчёта ТМ после AMRAP (вернём клиенту для уведомления)
  const tmRecalcs: TmRecalcResult[] = []

  const resolveRef = (ref: number | string): number | null => {
    if (typeof ref === "number") return ref
    return sessionMap.get(ref) ?? null
  }

  for (const op of ops) {
    switch (op.kind) {
      case "start": {
        if (cancelledLocal.has(op.localKey)) break
        const inserted = await db
          .insert(sessions)
          .values({
            workoutId: op.workoutId,
            startedAt: new Date(op.startedAt),
            status: "active",
          })
          .returning({ id: sessions.id })
        sessionMap.set(op.localKey, inserted[0].id)
        break
      }
      case "set": {
        const sessionId = resolveRef(op.sessionRef)
        if (sessionId == null) break
        await db.insert(loggedSets).values({
          sessionId,
          workoutExerciseId: op.workoutExerciseId,
          setNumber: op.setNumber,
          weight: op.weight != null ? String(op.weight) : null,
          reps: op.reps,
          rir: op.rir,
        })
        break
      }
      case "finish": {
        const sessionId = resolveRef(op.sessionRef)
        if (sessionId == null) break
        await db
          .update(sessions)
          .set({ status: "completed", finishedAt: new Date(op.finishedAt) })
          .where(eq(sessions.id, sessionId))
        // офлайн-завершённый AMRAP тоже пересчитывает ТМ
        const recalc = await applyAmrapTmRecalc(sessionId, { proposedTm: op.proposedTm })
        if (recalc) tmRecalcs.push(recalc)
        break
      }
      case "cancel": {
        // строковые ссылки уже учтены через cancelledLocal
        if (typeof op.sessionRef === "number") {
          await db
            .delete(loggedSets)
            .where(eq(loggedSets.sessionId, op.sessionRef))
          await db.delete(sessions).where(eq(sessions.id, op.sessionRef))
        }
        break
      }
      case "deleteSet": {
        await db.delete(loggedSets).where(eq(loggedSets.id, op.setId))
        break
      }
    }
  }

  return NextResponse.json({ ok: true, tmRecalcs })
}
