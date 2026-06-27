import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { workoutExercises } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export async function GET() {
  await ensureSchema()
  const deleted = await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.name, "Разминка"))
    .returning({ id: workoutExercises.id, workoutId: workoutExercises.workoutId })
  return NextResponse.json({
    ok: true,
    deletedCount: deleted.length,
    deleted,
  })
}
