"use client"

/** Расчёт блинов на штангу и разминочных подходов */

const BAR_KEY = "gym:bar-weight"
const PLATES_KEY = "gym:plates"

// гриф по умолчанию 20 кг
export const DEFAULT_BAR = 20
// доступные блины (по одной стороне берётся половина пары)
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]

export function getBarWeight(): number {
  if (typeof localStorage === "undefined") return DEFAULT_BAR
  const v = Number(localStorage.getItem(BAR_KEY))
  return v > 0 ? v : DEFAULT_BAR
}

export function setBarWeight(v: number) {
  localStorage.setItem(BAR_KEY, String(v))
}

export function getPlates(): number[] {
  if (typeof localStorage === "undefined") return DEFAULT_PLATES
  try {
    const raw = localStorage.getItem(PLATES_KEY)
    if (!raw) return DEFAULT_PLATES
    const arr = JSON.parse(raw) as number[]
    return arr.length ? arr.slice().sort((a, b) => b - a) : DEFAULT_PLATES
  } catch {
    return DEFAULT_PLATES
  }
}

export function setPlates(arr: number[]) {
  localStorage.setItem(PLATES_KEY, JSON.stringify(arr))
}

/**
 * Раскладка блинов на ОДНУ сторону штанги для целевого веса.
 * Возвращает массив блинов и фактический достижимый вес.
 */
export function platesFor(
  target: number,
  bar = getBarWeight(),
  plates = getPlates(),
): { perSide: number[]; achievable: number; leftover: number } {
  if (target <= bar) {
    return { perSide: [], achievable: bar, leftover: 0 }
  }
  let perSideWeight = (target - bar) / 2
  const perSide: number[] = []
  for (const p of plates) {
    while (perSideWeight >= p - 1e-9) {
      perSide.push(p)
      perSideWeight -= p
    }
  }
  const achievable = bar + 2 * perSide.reduce((a, b) => a + b, 0)
  return { perSide, achievable, leftover: Math.round(perSideWeight * 100) / 100 }
}

/** Короткая текстовая раскладка: "25+10+2.5" */
export function platesText(perSide: number[]): string {
  if (perSide.length === 0) return "только гриф"
  return perSide.map((p) => (Number.isInteger(p) ? p : p)).join(" + ")
}

export type WarmupSet = {
  pct: number
  weight: number
  reps: number
}

/**
 * Разминочные подходы к рабочему весу.
 * Схема под жимовую программу: 40 / 60 / 70 / 80 % (как в плане).
 */
export function warmupSets(workingWeight: number, bar = getBarWeight()): WarmupSet[] {
  if (!workingWeight || workingWeight <= bar) return []
  const scheme: { pct: number; reps: number }[] = [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.7, reps: 3 },
    { pct: 0.8, reps: 2 },
  ]
  return scheme
    .map(({ pct, reps }) => {
      // округляем до 2.5 кг
      const w = Math.max(bar, Math.round((workingWeight * pct) / 2.5) * 2.5)
      return { pct: Math.round(pct * 100), weight: w, reps }
    })
    .filter((s) => s.weight < workingWeight)
}
