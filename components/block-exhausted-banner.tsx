import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  appSettings,
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";

const H2_MAX_CYCLES = 5;

export async function BlockExhaustedBanner() {
  const settingsRows = await db.select().from(appSettings);
  const settings = Object.fromEntries(
    settingsRows.map((s) => [s.key, s.value]),
  );
  if ((settings.active_block ?? "v9") !== "h2") return null;

  const currentCycle = Number.parseInt(settings.current_cycle_h2 ?? "1", 10);

  const rows = await db
    .select({
      cycleNumber: cycles.number,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
    })
    .from(loggedSets)
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .where(
      and(
        eq(sessions.status, "completed"),
        eq(cycles.block, "h2"),
        ilike(workoutExercises.name, "%жим%"),
      ),
    );

  const tonnageByCycle = new Map<number, number>();
  for (const r of rows) {
    const w = r.weight != null ? Number.parseFloat(r.weight) : 0;
    const t = w * (r.reps ?? 0);
    tonnageByCycle.set(
      r.cycleNumber,
      (tonnageByCycle.get(r.cycleNumber) ?? 0) + t,
    );
  }
  // только завершённые циклы (текущий может быть неполным)
  const done = [...tonnageByCycle.keys()]
    .filter((n) => n < currentCycle)
    .sort((a, b) => a - b);
  const last3 = done.slice(-3).map((n) => tonnageByCycle.get(n) ?? 0);
  const stagnation =
    last3.length === 3 && last3[2] <= last3[1] && last3[1] <= last3[0];
  const overCap = currentCycle > H2_MAX_CYCLES;

  if (!stagnation && !overCap) return null;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-foreground">
        Гипертрофийный блок исчерпан — переходи в силовой
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {overCap
          ? `Пройдено ${currentCycle - 1} циклов — по плану блок ограничен ${H2_MAX_CYCLES}.`
          : "Тоннаж жимовых не растёт два цикла подряд."}{" "}
        Переключи блок на «Силовой V9» и начни с калибровочного AMRAP.
      </p>
    </div>
  );
}
