import { and, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { loggedSets } from "@/lib/db/schema";

export type StickingZone = "chest" | "middle" | "lockout";

export type StickingPointAnalysis = {
  zone: StickingZone;
  count: number;
  total: number;
  title: string;
  recommendation: string;
};

const ZONE_INFO: Record<StickingZone, { title: string; recommendation: string }> = {
  chest: {
    title: "Слабое место — грудь (срыв)",
    recommendation:
      "Добавь Spoto press или жим с паузой 2 сек на груди — контроль нижней точки без отдачи.",
  },
  middle: {
    title: "Слабое место — середина амплитуды",
    recommendation:
      "Добавь pin press с середины — старт с мёртвой точки прокачает самый слабый участок.",
  },
  lockout: {
    title: "Слабое место — локаут (дожим)",
    recommendation:
      "Добавь board press или жим узким хватом — перегрузка верхней трети и трицепса.",
  },
};

/** Порог дней анализа. */
const ANALYSIS_DAYS = 21;
/** Минимум тяжёлых подходов с отмеченной зоной, чтобы вывод был осмысленным. */
const MIN_SAMPLES = 3;

/**
 * Анализ тяжёлых подходов (rir <= 1) за последние 21 день.
 * Возвращает доминирующую зону застревания и рекомендацию вариации жима,
 * либо null, если данных мало или явного лидера нет.
 */
export async function analyzeStickingPoint(): Promise<StickingPointAnalysis | null> {
  const since = new Date(Date.now() - ANALYSIS_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ stickingPoint: loggedSets.stickingPoint })
    .from(loggedSets)
    .where(
      and(
        gte(loggedSets.createdAt, since),
        lte(loggedSets.rir, 1),
        isNotNull(loggedSets.stickingPoint),
      ),
    );

  const counts = new Map<StickingZone, number>();
  let total = 0;
  for (const row of rows) {
    const zone = row.stickingPoint as StickingZone;
    if (zone !== "chest" && zone !== "middle" && zone !== "lockout") continue;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
    total += 1;
  }
  if (total < MIN_SAMPLES) return null;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [zone, count] = sorted[0];
  // явного лидера нет — не советуем
  if (sorted.length > 1 && sorted[1][1] === count) return null;

  return { zone, count, total, ...ZONE_INFO[zone] };
}
