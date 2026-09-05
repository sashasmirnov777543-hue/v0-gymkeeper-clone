import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  programState,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import { getLastSetsByExerciseNames } from "@/app/actions/workout";
import { ACTIVE_PROGRAM_VERSION } from "@/lib/program/version";
import { safetyProfile } from "@/lib/program/policy";
import { requireAuth } from "@/lib/require-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const [allCycles, [state]] = await Promise.all([
    db
      .select()
      .from(cycles)
      .where(eq(cycles.programVersion, ACTIVE_PROGRAM_VERSION))
      .orderBy(asc(cycles.sortOrder)),
    db
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1),
  ]);
  const activeWorkouts = allCycles.length
    ? await db
        .select()
        .from(workouts)
        .where(
          inArray(
            workouts.cycleId,
            allCycles.map((c) => c.id),
          ),
        )
        .orderBy(asc(workouts.sortOrder))
    : [];
  const activeExercises = activeWorkouts.length
    ? await db
        .select()
        .from(workoutExercises)
        .where(
          inArray(
            workoutExercises.workoutId,
            activeWorkouts.map((w) => w.id),
          ),
        )
        .orderBy(asc(workoutExercises.sortOrder))
    : [];
  const lastSetsByName = await getLastSetsByExerciseNames([
    ...new Set<string>(activeExercises.map((e) => String(e.name))),
  ]);
  return NextResponse.json(
    {
      programVersion: ACTIVE_PROGRAM_VERSION,
      baseKg: Number(state?.rmrefKg ?? 115),
      safetyProfile: safetyProfile(state?.safetyProfile),
      lastSetsByName,
      cycles: allCycles.map((c) => ({
        ...c,
        workouts: activeWorkouts
          .filter((w) => w.cycleId === c.id)
          .map((w) => ({
            ...w,
            exercises: activeExercises
              .filter((e) => e.workoutId === w.id)
              .map((e) => ({
                ...e,
                targetRpeMin:
                  e.targetRpeMin == null ? null : Number(e.targetRpeMin),
                targetRpeMax:
                  e.targetRpeMax == null ? null : Number(e.targetRpeMax),
                condition: e.conditionCode,
              })),
          })),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
