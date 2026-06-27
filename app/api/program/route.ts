import { NextResponse } from "next/server"
import { asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { cycles, workoutExercises, workouts } from "@/lib/db/schema"
import { getLastSetsByExerciseNames } from "@/app/actions/workout"

export const dynamic = "force-dynamic"

export async function GET() {
  await ensureSchema()

  const [allCycles, allWorkouts, allExercises] = await Promise.all([
    db.select().from(cycles).orderBy(asc(cycles.sortOrder)),
    db.select().from(workouts).orderBy(asc(workouts.sortOrder)),
    db
      .select()
      .from(workoutExercises)
      .orderBy(asc(workoutExercises.sortOrder)),
  ])

  const names = [...new Set(allExercises.map((e) => e.name))]
  const lastSetsByName = await getLastSetsByExerciseNames(names)

  const result = allCycles.map((c) => ({
    id: c.id,
    number: c.number,
    name: c.name,
    macrocycle: c.macrocycle,
    block: c.block,
    notes: c.notes,
    workouts: allWorkouts
      .filter((w) => w.cycleId === c.id)
      .map((w) => ({
        id: w.id,
        cycleId: w.cycleId,
        label: w.label,
        title: w.title,
        notes: w.notes,
        kind: w.kind,
        cardioZone: w.cardioZone,
        cardioMinutes: w.cardioMinutes,
        exercises: allExercises
          .filter((e) => e.workoutId === w.id)
          .map((e) => ({
            id: e.id,
            workoutId: e.workoutId,
            name: e.name,
            weightText: e.weightText,
            tempo: e.tempo,
            targetReps: e.targetReps,
            targetSets: e.targetSets,
            targetRirMin: e.targetRirMin,
            targetRirMax: e.targetRirMax,
            comment: e.comment,
            restSeconds: e.restSeconds,
          })),
      })),
  }))

  return NextResponse.json({ cycles: result, lastSetsByName })
}
