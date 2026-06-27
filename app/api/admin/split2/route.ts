import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { workoutExercises } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

function splitField(value: string | null, sep: string): [string | null, string | null] {
  if (value == null) return [null, null]
  if (value.includes(sep)) {
    const parts = value.split(sep)
    const a = parts[0].trim()
    const b = parts.slice(1).join(sep).trim()
    return [a || null, b || null]
  }
  return [value, value]
}

export async function GET(request: Request) {
  await ensureSchema()
  const sp = new URL(request.url).searchParams
  const from = sp.get("from")
  const nameA = sp.get("a")
  const nameB = sp.get("b")
  const apply = sp.get("apply") === "1"
  if (!from || !nameA || !nameB) {
    return NextResponse.json({ error: "missing from/a/b", from, nameA, nameB }, { status: 400 })
  }

  const all = await db.select().from(workoutExercises)
  const matched = all.filter((r) => r.name === from).length

  const byWorkout = new Map<number, typeof all>()
  for (const r of all) {
    const arr = byWorkout.get(r.workoutId)
    if (arr) arr.push(r)
    else byWorkout.set(r.workoutId, [r])
  }

  const samples: Array<{ workoutId: number; after: string[] }> = []
  let affected = 0
  const ops: Array<Promise<unknown>> = []

  for (const [wid, listRaw] of byWorkout) {
    const list = [...listRaw].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    if (!list.some((r) => r.name === from)) continue
    affected++
    const expanded: Array<Record<string, unknown>> = []
    for (const r of list) {
      if (r.name === from) {
        const [repsA, repsB] = splitField(r.targetReps, "/")
        const [setsA, setsB] = splitField(r.targetSets, "/")
        expanded.push({ kind: "update", id: r.id, name: nameA, targetReps: repsA, targetSets: setsA })
        expanded.push({ kind: "insert", base: r, name: nameB, targetReps: repsB, targetSets: setsB })
      } else {
        expanded.push({ kind: "keep", id: r.id, name: r.name })
      }
    }
    if (samples.length < 3) {
      samples.push({
        workoutId: wid,
        after: expanded.map((e) =>
          e.kind === "insert" ? (e.name as string) + " [NEW]" : e.kind === "update" ? (e.name as string) + " [UPD]" : (e.name as string),
        ),
      })
    }
    if (apply) {
      for (let i = 0; i < expanded.length; i++) {
        const it = expanded[i]
        if (it.kind === "keep") {
          ops.push(db.update(workoutExercises).set({ sortOrder: i }).where(eq(workoutExercises.id, it.id as number)))
        } else if (it.kind === "update") {
          ops.push(db.update(workoutExercises).set({ sortOrder: i, name: it.name as string, targetReps: it.targetReps as string | null, targetSets: it.targetSets as string | null }).where(eq(workoutExercises.id, it.id as number)))
        } else {
          const b = it.base as (typeof all)[number]
          ops.push(db.insert(workoutExercises).values({ workoutId: b.workoutId, sortOrder: i, name: it.name as string, weightText: b.weightText, pctOfTm: b.pctOfTm, targetReps: it.targetReps as string | null, targetSets: it.targetSets as string | null, targetRirMin: b.targetRirMin, targetRirMax: b.targetRirMax, tempo: b.tempo, comment: b.comment, restSeconds: b.restSeconds }))
        }
      }
    }
  }
  if (apply) await Promise.all(ops)

  return NextResponse.json({ apply, from, nameA, nameB, matched, affectedWorkouts: affected, samples })
}
