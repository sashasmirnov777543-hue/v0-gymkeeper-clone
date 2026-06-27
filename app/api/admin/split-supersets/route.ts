import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { workoutExercises } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

const EMDASH = "\u2014"

function isCombo(name: string): boolean {
  return name.includes(" + ") && !name.includes(EMDASH)
}

function cap(s: string): string {
  const t = s.trim()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function splitField(value: string | null): [string | null, string | null] {
  if (value == null) return [null, null]
  if (value.includes("/")) {
    const parts = value.split("/")
    const a = parts[0].trim()
    const b = parts.slice(1).join("/").trim()
    return [a || null, b || null]
  }
  return [value, value]
}

export async function GET(request: Request) {
  await ensureSchema()
  const apply = new URL(request.url).searchParams.get("apply") === "1"

  const all = await db.select().from(workoutExercises)
  const byWorkout = new Map<number, typeof all>()
  for (const r of all) {
    const arr = byWorkout.get(r.workoutId)
    if (arr) arr.push(r)
    else byWorkout.set(r.workoutId, [r])
  }

  const willSplit = new Set<string>()
  const excluded = new Set<string>()
  for (const r of all) {
    if (r.name.includes(" + ")) {
      if (r.name.includes(EMDASH)) excluded.add(r.name)
      else willSplit.add(r.name)
    }
  }

  const samples: Array<{ workoutId: number; before: string[]; after: string[] }> = []
  let affectedWorkouts = 0
  let totalSplit = 0
  const ops: Array<Promise<unknown>> = []

  for (const [wid, listRaw] of byWorkout) {
    const list = [...listRaw].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    )
    if (!list.some((r) => isCombo(r.name))) continue
    affectedWorkouts++

    const expanded: Array<Record<string, unknown>> = []
    for (const r of list) {
      if (isCombo(r.name)) {
        totalSplit++
        const idx = r.name.indexOf(" + ")
        const nameA = r.name.slice(0, idx).trim()
        const nameB = cap(r.name.slice(idx + 3))
        const [repsA, repsB] = splitField(r.targetReps)
        const [setsA, setsB] = splitField(r.targetSets)
        expanded.push({
          kind: "update",
          id: r.id,
          name: nameA,
          targetReps: repsA,
          targetSets: setsA,
        })
        expanded.push({
          kind: "insert",
          base: r,
          name: nameB,
          targetReps: repsB,
          targetSets: setsB,
        })
      } else {
        expanded.push({ kind: "keep", id: r.id, name: r.name })
      }
    }

    if (samples.length < 4) {
      samples.push({
        workoutId: wid,
        before: list.map((r) => r.name),
        after: expanded.map((e) =>
          e.kind === "insert"
            ? (e.name as string) + " [NEW]"
            : e.kind === "update"
              ? (e.name as string) + " [UPD]"
              : (e.name as string),
        ),
      })
    }

    if (apply) {
      for (let i = 0; i < expanded.length; i++) {
        const it = expanded[i]
        if (it.kind === "keep") {
          ops.push(
            db
              .update(workoutExercises)
              .set({ sortOrder: i })
              .where(eq(workoutExercises.id, it.id as number)),
          )
        } else if (it.kind === "update") {
          ops.push(
            db
              .update(workoutExercises)
              .set({
                sortOrder: i,
                name: it.name as string,
                targetReps: it.targetReps as string | null,
                targetSets: it.targetSets as string | null,
              })
              .where(eq(workoutExercises.id, it.id as number)),
          )
        } else {
          const b = it.base as (typeof all)[number]
          ops.push(
            db.insert(workoutExercises).values({
              workoutId: b.workoutId,
              sortOrder: i,
              name: it.name as string,
              weightText: b.weightText,
              pctOfTm: b.pctOfTm,
              targetReps: it.targetReps as string | null,
              targetSets: it.targetSets as string | null,
              targetRirMin: b.targetRirMin,
              targetRirMax: b.targetRirMax,
              tempo: b.tempo,
              comment: null,
              restSeconds: b.restSeconds,
            }),
          )
        }
      }
    }
  }

  if (apply) await Promise.all(ops)

  return NextResponse.json({
    apply,
    willSplitNames: [...willSplit],
    excludedNames: [...excluded],
    affectedWorkouts,
    totalSplit,
    samples,
  })
}
