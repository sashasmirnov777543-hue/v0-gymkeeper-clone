import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSchema } from "@/lib/db/migrate"
import { workoutExercises } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export async function GET() {
  await ensureSchema()
  const target = "\u0420\u0430\u0437\u043c\u0438\u043d\u043a\u0430"
  const before = await db
    .select({ name: workoutExercises.name })
    .from(workoutExercises)
  const distinctNames = [...new Set(before.map((r) => r.name))]
  const deleted = await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.name, target))
    .returning({ id: workoutExercises.id, workoutId: workoutExercises.workoutId })
  return NextResponse.json({
    ok: true,
    target,
    deletedCount: deleted.length,
    deleted,
    distinctNames,
  })
}
