import { and, eq, gte, ilike, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { loggedSets, sessions, workoutExercises } from "@/lib/db/schema";

export type StickingZone = "chest" | "middle" | "lockout";

export type StickingPointRecommendation = {
  zone: StickingZone;
  counts: Record<StickingZone, number>;
  totalHardSets: number;
  variation: string;
  cue: string;
};

const VARIATIONS: Record<StickingZone, { variation: string; cue: string }> = {
  chest: {
    variation: "Spoto press / жим с паузой 2 сек",
    cue: "Стопор у груди: пауза 2–3 см над грудью, контроль съёма. 3–4×3–5 @ 70–80% ТМ.",
  },
  middle: {
    variation: "Pin press с середины амплитуды",
    cue: "Стопор в середине: жим с упоров с мёртвой точки. 3–4×2–4 @ 75–85% ТМ.",
  },
  lockout: {
    variation: "Board press / жим узким хватом",
    cue: "Стопор в локауте: перегрузка верха амплитуды. Board press считается от e1RM, не от ТМ.",
  },
};

const MIN_HARD_SETS = 3;
const LOOKBACK_DAYS = 21;

/**
 * Анализ зоны стопора по тяжёлым подходам (RIR <= 1) жимовых
 * упражнений за последние 3 недели. Возвращает null, если данных мало.
 */
export async function getStickingPointRecommendation(): Promise<StickingPointRecommendation | null> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ stickingPoint: loggedSets.stickingPoint })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.status, "completed"),
        gte(loggedSets.createdAt, since),
        isNotNull(loggedSets.stickingPoint),
        lte(loggedSets.rir, 1),
        ilike(workoutExercises.name, "%жим%"),
      ),
    );

  const counts: Record<StickingZone, number> = {
    chest: 0,
    middle: 0,
    lockout: 0,
  };
  let total = 0;
  for (const row of rows) {
    const zone = row.stickingPoint as StickingZone | null;
    if (zone && zone in counts) {
      counts[zone] += 1;
      total += 1;
    }
  }
  if (total < MIN_HARD_SETS) return null;

  const zone = (Object.keys(counts) as StickingZone[]).reduce((a, b) =>
    counts[b] > counts[a] ? b : a,
  );
  return { zone, counts, totalHardSets: total, ...VARIATIONS[zone] };
}
