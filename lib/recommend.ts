// Логика рекомендации веса на основе RIR (Reps In Reserve)

export type LoggedSetLite = {
  weight: number | null
  reps: number | null
  rir: number | null
}

export type Recommendation = {
  weight: number
  reason: string
  direction: "up" | "down" | "same"
} | null

const STEP = 2.5 // шаг штанги, кг

export function roundToStep(w: number): number {
  return Math.round(w / STEP) * STEP
}

// Стартовый вес из текста типа "70 % (77), RPE 7" или "40 кг, RIR 3"
export function parsePrescribedWeight(weightText: string | null): number | null {
  if (!weightText) return null
  const paren = weightText.match(/\(([\d]+(?:[.,]\d+)?)\)/)
  if (paren) return Number.parseFloat(paren[1].replace(",", "."))
  const kg = weightText.match(/([\d]+(?:[.,]\d+)?)\s*кг/)
  if (kg) return Number.parseFloat(kg[1].replace(",", "."))
  return null
}

export function targetRirMid(min: number | null, max: number | null): number {
  if (min != null && max != null) return (min + max) / 2
  if (min != null) return min
  if (max != null) return max
  return 2 // дефолтный целевой RIR
}

/** Целевой диапазон RIR. Если границы не заданы — дефолт 1–3. */
export function targetRirBand(
  min: number | null,
  max: number | null,
): { lo: number; hi: number } {
  const lo = min ?? max ?? 1
  const hi = max ?? min ?? 3
  return lo <= hi ? { lo, hi } : { lo: hi, hi: lo }
}

/** Округление «половина — от нуля»: симметрично для + и − (Math.round в JS тянет -0.5 к 0). */
function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x))
}

/** Вес в программе задан процентом от ТМ ("70 % (77), RPE 7")? Тогда нагрузка фиксированная. */
export function isPercentPrescribed(weightText: string | null): boolean {
  return weightText != null && weightText.includes("%")
}

/**
 * Рекомендация веса для следующего подхода / тренировки.
 *
 * Фактический RIR сравнивается с целевым ДИАПАЗОНОМ (а не с серединой):
 * внутри диапазона -> держим вес,
 * выше диапазона (легче, чем надо) -> повысить,
 * ниже диапазона (тяжелее) -> снизить.
 * Корректировка пропорциональна выходу за границу, максимум ±2 шага (±5 кг).
 *
 * `fixedLoad` — вес задан программой (процент от ТМ, фиксированные повторения):
 * выше предписанного веса НЕ рекомендуем. Запас сверх цели в таких циклах —
 * это план (например, намеренно недогруженный вводный цикл), а не повод
 * накидывать блины. Снижение при перегрузе остаётся.
 */
export function recommendWeight(
  pastSets: LoggedSetLite[],
  targetMin: number | null,
  targetMax: number | null,
  fallbackWeight: number | null,
  opts?: { fixedLoad?: boolean },
): Recommendation {
  const fixedLoad = opts?.fixedLoad ?? false
  const prescribed = fallbackWeight != null ? roundToStep(fallbackWeight) : null

  const working = pastSets.filter(
    (s) => s.weight != null && s.weight > 0 && s.rir != null,
  )
  if (working.length === 0) {
    if (prescribed != null) {
      return {
        weight: prescribed,
        reason: "Стартовый вес по программе",
        direction: "same",
      }
    }
    return null
  }

  const { lo, hi } = targetRirBand(targetMin, targetMax)
  const bandText = lo === hi ? formatRir(lo) : `${formatRir(lo)}–${formatRir(hi)}`
  const maxWeight = Math.max(...working.map((s) => s.weight as number))
  // рабочие подходы = подходы на максимальном весе
  const topSets = working.filter((s) => s.weight === maxWeight)
  const avgRir =
    topSets.reduce((sum, s) => sum + (s.rir as number), 0) / topSets.length

  // отклонение считаем от ГРАНИЦЫ диапазона, а не от середины:
  // RIR внутри цели не должен менять вес
  const delta = avgRir > hi ? avgRir - hi : avgRir < lo ? avgRir - lo : 0
  // одна "ступень" корректировки за каждый полный RIR выхода за цель, максимум 2
  let steps = Math.max(-2, Math.min(2, roundHalfAway(delta)))

  // Фиксированная нагрузка (% от ТМ): вверх от предписанного веса не уходим.
  if (fixedLoad && steps > 0) {
    if (prescribed == null || maxWeight >= prescribed) {
      const base = prescribed != null ? Math.min(maxWeight, prescribed) : maxWeight
      return {
        weight: roundToStep(base),
        reason: `RIR ${formatRir(avgRir)} — запас есть, и это по плану. Вес задан программой, не повышай`,
        direction: "same",
      }
    }
    // ниже предписанного — можно подняться, но не выше плана
    const capped = Math.min(roundToStep(maxWeight + steps * STEP), prescribed)
    const diff = capped - maxWeight
    if (diff <= 0) {
      return {
        weight: roundToStep(maxWeight),
        reason: `RIR ${formatRir(avgRir)} — держи вес по программе`,
        direction: "same",
      }
    }
    return {
      weight: capped,
      reason: `RIR был ${formatRir(avgRir)} при цели ${bandText} — добери до веса по программе (${capped} кг)`,
      direction: "up",
    }
  }

  const newWeight = roundToStep(maxWeight + steps * STEP)

  if (steps > 0) {
    return {
      weight: newWeight,
      reason: `RIR был ${formatRir(avgRir)} при цели ${bandText} — было легко, добавь ${steps * STEP} кг`,
      direction: "up",
    }
  }
  if (steps < 0) {
    return {
      weight: newWeight,
      reason: `RIR был ${formatRir(avgRir)} при цели ${bandText} — тяжеловато, убавь ${Math.abs(steps) * STEP} кг`,
      direction: "down",
    }
  }
  return {
    weight: newWeight,
    reason: `RIR ${formatRir(avgRir)} в цели ${bandText} — держи вес`,
    direction: "same",
  }
}

function formatRir(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// Формула Эпли: e1RM = вес × (1 + 0.0333 × повторения)
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight
  return weight * (1 + 0.0333 * reps)
}
