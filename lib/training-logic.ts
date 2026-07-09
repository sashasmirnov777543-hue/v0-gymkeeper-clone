export const DEFAULT_WEIGHT_STEP = 2.5
export const V9_TM_FACTOR = 0.9

export function roundToStep(value: number, step = DEFAULT_WEIGHT_STEP): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    throw new Error("Некорректное значение или шаг округления")
  }
  return Math.round(value / step) * step
}

export function epley1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isInteger(reps) || reps <= 0) {
    throw new Error("Вес и повторения должны быть положительными")
  }
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

export function trainingMaxFromAmrap(
  weight: number,
  reps: number,
  factor = V9_TM_FACTOR,
  step = DEFAULT_WEIGHT_STEP,
): { e1rm: number; tm: number } {
  const e1rm = epley1RM(weight, reps)
  return { e1rm, tm: roundToStep(e1rm * factor, step) }
}

export function weightFromPercent(percent: number, base: number, step = DEFAULT_WEIGHT_STEP): number {
  return roundToStep((percent / 100) * base, step)
}

function fmtKg(value: number): string {
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)).replace(".", ",")
}

export function recalcWeightText(text: string, newTm: number): string {
  return text.replace(
    /(\d+(?:[.,]\d+)?)(\s*%(?:\s*ТМ)?\s*)\((\d+(?:[.,]\d+)?)\)/g,
    (_match, percent: string, middle: string) => {
      const value = Number.parseFloat(percent.replace(",", "."))
      return `${percent}${middle}(${fmtKg(weightFromPercent(value, newTm))})`
    },
  )
}
