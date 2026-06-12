// Автоматический пересчёт тренировочного максимума (ТМ) после теста AMRAP.
// По программе: AMRAP в цикле 4 (Макро 1) задаёт ТМ для Макро 2,
// AMRAP в цикле 8 (Макро 2) — ТМ для Макро 3 (пик).
// Серверный модуль: используется и в server action, и в /api/sync.

import { and, eq, ilike, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  appSettings,
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema"
import { epley1RM } from "@/lib/recommend"

export type TmRecalcResult = {
  /** Макроцикл, для которого пересчитан ТМ */
  macro: number
  oldTm: number | null
  newTm: number
  /** Лучший подход AMRAP */
  amrapWeight: number
  amrapReps: number
  e1rm: number
  /** Сколько строк программы получили новые веса */
  updatedExercises: number
}

/** Округление к ближайшим 0,5 кг — как в исходной программе (93,5; 82,5 …) */
function roundHalf(x: number): number {
  return Math.round(x * 2) / 2
}

/** Формат числа в стиле программы: запятая как разделитель, без хвоста ",0" */
function fmtKg(x: number): string {
  return (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace(".", ",")
}

/**
 * Пересчитывает скобочные веса в тексте вида "80 % (90), RPE 8" или
 * "88 % (99) → 92 % (104)" от нового ТМ. Текст без процентов не трогаем.
 */
export function recalcWeightText(text: string, newTm: number): string {
  return text.replace(
    /(\d+(?:[.,]\d+)?)(\s*%(?:\s*ТМ)?\s*)\((\d+(?:[.,]\d+)?)\)/g,
    (_m, pct: string, mid: string, _old: string) => {
      const p = Number.parseFloat(pct.replace(",", "."))
      const w = roundHalf((p / 100) * newTm)
      return `${pct}${mid}(${fmtKg(w)})`
    },
  )
}

/**
 * Если в завершённой сессии есть подходы AMRAP-упражнения — пересчитать ТМ
 * следующего макроцикла и обновить веса всех его упражнений с процентами.
 * Возвращает результат пересчёта или null, если AMRAP в сессии не было.
 */
export async function applyAmrapTmRecalc(
  sessionId: number,
): Promise<TmRecalcResult | null> {
  // сессия -> тренировка -> цикл (нужен макроцикл)
  const sessionRows = await db
    .select({
      workoutId: sessions.workoutId,
      macrocycle: cycles.macrocycle,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  if (sessionRows.length === 0) return null
  const { macrocycle } = sessionRows[0]

  // AMRAP задаёт ТМ следующего макроцикла; после Макро 3 пересчитывать нечего
  const targetMacro = macrocycle + 1
  if (targetMacro > 3) return null

  // подходы AMRAP-упражнений в этой сессии
  const amrapSets = await db
    .select({
      weight: loggedSets.weight,
      reps: loggedSets.reps,
    })
    .from(loggedSets)
    .innerJoin(
      workoutExercises,
      eq(loggedSets.workoutExerciseId, workoutExercises.id),
    )
    .where(
      and(
        eq(loggedSets.sessionId, sessionId),
        ilike(workoutExercises.name, "%AMRAP%"),
      ),
    )

  // лучший подход по e1RM
  let best: { weight: number; reps: number; e1rm: number } | null = null
  for (const s of amrapSets) {
    const w = s.weight != null ? Number.parseFloat(s.weight) : null
    if (w == null || w <= 0 || s.reps == null || s.reps <= 0) continue
    const e = epley1RM(w, s.reps)
    if (!best || e > best.e1rm) best = { weight: w, reps: s.reps, e1rm: e }
  }
  if (!best) return null

  // Правило ТМ из программы (§4): новый ТМ = 0,95 × e1RM —
  // держит рабочие проценты честными, без завышения.
  const newTm = roundHalf(0.95 * best.e1rm)
  const tmKey = `tm_macro${targetMacro}`

  // старый ТМ
  const oldRows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, tmKey))
    .limit(1)
  const oldTm =
    oldRows.length > 0 ? Number.parseFloat(oldRows[0].value) : null

  // сохраняем новый ТМ
  await db
    .insert(appSettings)
    .values({ key: tmKey, value: String(newTm) })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(newTm) },
    })

  // пересчитываем скобочные веса в упражнениях целевого макроцикла
  const targetCycles = await db
    .select({ id: cycles.id })
    .from(cycles)
    .where(eq(cycles.macrocycle, targetMacro))
  const cycleIds = targetCycles.map((c) => c.id)

  let updatedExercises = 0
  if (cycleIds.length > 0) {
    const targetWorkouts = await db
      .select({ id: workouts.id })
      .from(workouts)
      .where(inArray(workouts.cycleId, cycleIds))
    const workoutIds = targetWorkouts.map((w) => w.id)

    if (workoutIds.length > 0) {
      const targetExercises = await db
        .select({
          id: workoutExercises.id,
          weightText: workoutExercises.weightText,
        })
        .from(workoutExercises)
        .where(inArray(workoutExercises.workoutId, workoutIds))

      for (const ex of targetExercises) {
        if (!ex.weightText) continue
        const next = recalcWeightText(ex.weightText, newTm)
        if (next !== ex.weightText) {
          await db
            .update(workoutExercises)
            .set({ weightText: next })
            .where(eq(workoutExercises.id, ex.id))
          updatedExercises += 1
        }
      }
    }
  }

  return {
    macro: targetMacro,
    oldTm,
    newTm,
    amrapWeight: best.weight,
    amrapReps: best.reps,
    e1rm: Math.round(best.e1rm * 10) / 10,
    updatedExercises,
  }
}
