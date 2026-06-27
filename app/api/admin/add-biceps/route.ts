import { NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { cycles, workouts, workoutExercises } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await ensureSchema()
  const sp = new URL(request.url).searchParams
  const block = sp.get("block") || "h2"
  const apply = sp.get("apply") === "1"
  const name = sp.get("name")
  const reps = sp.get("reps")
  const sets = sp.get("sets")
  const weight = sp.get("weight")
  const comment = sp.get("comment")
  const after = sp.get("after")
  const rirMinRaw = sp.get("rirMin")
  const rirMaxRaw = sp.get("rirMax")
  const rirMin = rirMinRaw != null && rirMinRaw !== "" ? Number(rirMinRaw) : null
  const rirMax = rirMaxRaw != null && rirMaxRaw !== "" ? Number(rirMaxRaw) : null
  const cyclesParam = sp.get("cycles")
  const cyclesFilter = cyclesParam
    ? new Set(cyclesParam.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)))
    : null

  const allCycles = await db.select().from(cycles).orderBy(asc(cycles.sortOrder))
  const blockCycles = allCycles.filter((c) => c.block === block)
  const allWorkouts = await db.select().from(workouts).orderBy(asc(workouts.sortOrder))
  const allEx = await db.select().from(workoutExercises).orderBy(asc(workoutExercises.sortOrder))

  const report: Array<Record<string, unknown>> = []
  const ops: Array<Promise<unknown>> = []

  for (const c of blockCycles) {
    const inFilter = !cyclesFilter || cyclesFilter.has(c.number)
    const cw = allWorkouts.filter((w) => w.cycleId === c.id)
    const strength = cw
      .filter((w) => w.kind === "strength")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    const first = strength[0]
    if (!first) {
      report.push({ cycle: c.number, cycleName: c.name, firstStrength: null, inFilter })
      continue
    }
    const exs = allEx
      .filter((e) => e.workoutId === first.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    const exNames = exs.map((e) => e.name)
    const already = name ? exNames.includes(name) : false

    report.push({
      cycle: c.number,
      cycleName: c.name,
      macrocycle: c.macrocycle,
      firstStrengthWorkoutId: first.id,
      label: first.label,
      title: first.title,
      exercises: exNames,
      alreadyHasNew: already,
      inFilter,
    })

    if (apply && inFilter && name && reps && sets && !already) {
      let insertIndex = exs.length
      if (after) {
        const idx = exs.findIndex((e) => e.name === after)
        if (idx >= 0) insertIndex = idx + 1
      }
      const finalList: Array<{ kind: string; id?: number }> = []
      for (let i = 0; i <= exs.length; i++) {
        if (i === insertIndex) finalList.push({ kind: "new" })
        if (i < exs.length) finalList.push({ kind: "old", id: exs[i].id })
      }
      for (let i = 0; i < finalList.length; i++) {
        const it = finalList[i]
        if (it.kind === "old") {
          ops.push(
            db.update(workoutExercises).set({ sortOrder: i }).where(eq(workoutExercises.id, it.id as number)),
          )
        } else {
          ops.push(
            db.insert(workoutExercises).values({
              workoutId: first.id,
              sortOrder: i,
              name: name as string,
              weightText: weight,
              pctOfTm: null,
              targetReps: reps,
              targetSets: sets,
              targetRirMin: rirMin,
              targetRirMax: rirMax,
              tempo: null,
              comment: comment,
              restSeconds: null,
            }),
          )
        }
      }
    }
  }

  if (apply) await Promise.all(ops)

  return NextResponse.json({ block, apply, name, reps, sets, after, cycles: cyclesParam, cycleCount: report.length, report })
}
