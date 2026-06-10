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

/**
 * Рекомендация веса для следующего подхода / тренировки.
 * Сравнивает фактический RIR прошлых подходов с целевым:
 * RIR выше целевого (легче, чем надо) -> повысить вес,
 * RIR ниже целевого (тяжелее) -> снизить.
 */
export function recommendWeight(
  pastSets: LoggedSetLite[],
  targetMin: number | null,
  targetMax: number | null,
  fallbackWeight: number | null,
): Recommendation {
  const working = pastSets.filter(
    (s) => s.weight != null && s.weight > 0 && s.rir != null,
  )
  if (working.length === 0) {
    if (fallbackWeight != null) {
      return {
        weight: roundToStep(fallbackWeight),
        reason: "Стартовый вес по программе",
        direction: "same",
      }
    }
    return null
  }

  const target = targetRirMid(targetMin, targetMax)
  const maxWeight = Math.max(...working.map((s) => s.weight as number))
  // рабочие подходы = подходы на максимальном весе
  const topSets = working.filter((s) => s.weight === maxWeight)
  const avgRir =
    topSets.reduce((sum, s) => sum + (s.rir as number), 0) / topSets.length

  const delta = avgRir - target
  // одна "ступень" корректировки за каждый полный RIR отклонения, максимум 2
  const steps = Math.max(-2, Math.min(2, Math.round(delta)))
  const newWeight = roundToStep(maxWeight + steps * STEP)

  if (steps > 0) {
    return {
      weight: newWeight,
      reason: `RIR был ${formatRir(avgRir)} при цели ${formatRir(target)} — было легко, добавь ${steps * STEP} кг`,
      direction: "up",
    }
  }
  if (steps < 0) {
    return {
      weight: newWeight,
      reason: `RIR был ${formatRir(avgRir)} при цели ${formatRir(target)} — тяжеловато, убавь ${Math.abs(steps) * STEP} кг`,
      direction: "down",
    }
  }
  return {
    weight: newWeight,
    reason: `RIR ${formatRir(avgRir)} в цели — держи вес`,
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
