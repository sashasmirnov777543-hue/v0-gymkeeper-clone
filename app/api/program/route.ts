import { NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { cycles, workoutExercises, workouts } from "@/lib/db/schema"
import { getLastSetsByExerciseNames } from "@/app/actions/workout"

export const dynamic = "force-dynamic"

export async function GET() {
  await ensureSchema()

  const [allCycles, allWorkouts, allExercises] = await Promise.all([
    db
      .select()
      .from(cycles)
      .where(eq(cycles.programVersion, "h2-v9-3.0"))
      .orderBy(asc(cycles.sortOrder)),
    db.select().from(workouts).orderBy(asc(workouts.sortOrder)),
    db
      .select()
      .from(workoutExercises)
      .orderBy(asc(workoutExercises.sortOrder)),
  ])

  const cycleIds = new Set(allCycles.map((cycle) => cycle.id))
  const activeWorkouts = allWorkouts.filter((workout) => cycleIds.has(workout.cycleId))
  const workoutIds = new Set(activeWorkouts.map((workout) => workout.id))
  const activeExercises = allExercises.filter((exercise) =>
    workoutIds.has(exercise.workoutId),
  )
  const names = [...new Set(activeExercises.map((exercise) => exercise.name))]
  const lastSetsByName = await getLastSetsByExerciseNames(names)

  const result = allCycles.map((c) => ({
    id: c.id,
    number: c.number,
    name: c.name,
    macrocycle: c.macrocycle,
    block: c.block,
    notes: c.notes,
    workouts: activeWorkouts
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
        prescription: w.prescription,
        branches: w.branches,
        exercises: activeExercises
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
            targetRpeMin: e.targetRpeMin != null ? Number(e.targetRpeMin) : null,
            targetRpeMax: e.targetRpeMax != null ? Number(e.targetRpeMax) : null,
            role: e.role,
            isOptional: e.isOptional,
            condition: e.conditionCode,
            comment: e.comment,
            restSeconds: e.restSeconds,
          })),
      })),
  }))

  return NextResponse.json({
    programVersion: "h2-v9-3.0",
    cycles: result,
    lastSetsByName,
  })
}
