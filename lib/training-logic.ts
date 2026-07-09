export const DEFAULT_WEIGHT_STEP = 2.5;
export const V9_TM_FACTOR = 0.9;
export type ReadinessLevel = "green" | "yellow" | "orange" | "red";
export type ReadinessInput = {
  sleepMinutes: number;
  sleepQuality: number;
  morningPulseDelta: number;
  shoulderPain: number;
  backPain: number;
  energy: number;
};
export const READINESS_TEXT: Record<
  ReadinessLevel,
  { title: string; action: string }
> = {
  green: { title: "Зелёный — готов", action: "Тренируйся по плану." },
  yellow: {
    title: "Жёлтый — осторожно",
    action: "Не форсируй вес, контролируй RIR.",
  },
  orange: {
    title: "Оранжевый — мини-тейпер",
    action: "Изоляция и миорепсы убраны, кардио −30%.",
  },
  red: {
    title: "Красный — восстановление",
    action: "Только основная работа, кардио −50%. При боли лучше отдых.",
  },
};
export function readinessLevel(i: ReadinessInput): ReadinessLevel {
  let s = 0;
  s +=
    i.sleepMinutes < 300
      ? 3
      : i.sleepMinutes < 360
        ? 2
        : i.sleepMinutes < 420
          ? 1
          : 0;
  s +=
    i.sleepQuality <= 1
      ? 3
      : i.sleepQuality === 2
        ? 2
        : i.sleepQuality === 3
          ? 1
          : 0;
  s +=
    i.morningPulseDelta >= 15
      ? 3
      : i.morningPulseDelta >= 10
        ? 2
        : i.morningPulseDelta >= 5
          ? 1
          : 0;
  const pain = Math.max(i.shoulderPain, i.backPain);
  s += pain >= 7 ? 4 : pain >= 4 ? 2 : pain >= 2 ? 1 : 0;
  s += i.energy <= 1 ? 3 : i.energy === 2 ? 2 : i.energy === 3 ? 1 : 0;
  return pain >= 7 || s >= 10
    ? "red"
    : s >= 7
      ? "orange"
      : s >= 3
        ? "yellow"
        : "green";
}
export const isMiniTaper = (level?: string | null) =>
  level === "orange" || level === "red";
export function isIsolationExercise(name: string): boolean {
  const v = name.toLocaleLowerCase("ru-RU");
  if (/жим|присед|станов|тяга штан|подтяг|отжим/.test(v)) return false;
  return /бицеп|трицеп|сгибан|разгибан|развод|махи|дельт|предплеч|икр|пуловер|кроссовер/.test(
    v,
  );
}
export function adjustedCardioMinutes(
  n: number,
  level?: string | null,
): number {
  return level === "red"
    ? Math.max(5, Math.round(n * 0.5))
    : level === "orange"
      ? Math.max(5, Math.round(n * 0.7))
      : n;
}

export function roundToStep(value: number, step = DEFAULT_WEIGHT_STEP): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    throw new Error("Некорректное значение или шаг округления");
  }
  return Math.round(value / step) * step;
}

export function epley1RM(weight: number, reps: number): number {
  if (
    !Number.isFinite(weight) ||
    weight <= 0 ||
    !Number.isInteger(reps) ||
    reps <= 0
  ) {
    throw new Error("Вес и повторения должны быть положительными");
  }
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function trainingMaxFromAmrap(
  weight: number,
  reps: number,
  factor = V9_TM_FACTOR,
  step = DEFAULT_WEIGHT_STEP,
): { e1rm: number; tm: number } {
  const e1rm = epley1RM(weight, reps);
  return { e1rm, tm: roundToStep(e1rm * factor, step) };
}

export function weightFromPercent(
  percent: number,
  base: number,
  step = DEFAULT_WEIGHT_STEP,
): number {
  return roundToStep((percent / 100) * base, step);
}

export function isBoardPress(name: string): boolean {
  return /board\s*press|жим\s+(?:с|от)\s+бруск/i.test(name);
}

/**
 * Основные упражнения считаются от TM, board press — от расчётного e1RM.
 * Разделение намеренное: перегрузка локаута не должна уменьшаться второй раз
 * из-за коэффициента TM (0,90).
 */
export function programWeightFromPercent(
  exerciseName: string,
  percent: number,
  bases: { tm: number; e1rm: number },
  step = DEFAULT_WEIGHT_STEP,
): number {
  const base = isBoardPress(exerciseName) ? bases.e1rm : bases.tm;
  return weightFromPercent(percent, base, step);
}

function fmtKg(value: number): string {
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)).replace(
    ".",
    ",",
  );
}

export function recalcWeightText(text: string, newTm: number): string {
  return text.replace(
    /(\d+(?:[.,]\d+)?)(\s*%(?:\s*ТМ)?\s*)\((\d+(?:[.,]\d+)?)\)/g,
    (_match, percent: string, middle: string) => {
      const value = Number.parseFloat(percent.replace(",", "."));
      return `${percent}${middle}(${fmtKg(weightFromPercent(value, newTm))})`;
    },
  );
}

/** Пересчёт строки упражнения с корректной базой процента. */
export function recalcExerciseWeightText(
  exerciseName: string,
  text: string,
  newTm: number,
  e1rm = newTm / V9_TM_FACTOR,
): string {
  if (!isBoardPress(exerciseName)) return recalcWeightText(text, newTm);
  return text.replace(
    /(\d+(?:[.,]\d+)?)(\s*%\s*(?:e1rm|1пм)?\s*)\((\d+(?:[.,]\d+)?)\)/gi,
    (_match, percent: string, middle: string) => {
      const value = Number.parseFloat(percent.replace(",", "."));
      const weight = programWeightFromPercent(exerciseName, value, {
        tm: newTm,
        e1rm,
      });
      return `${percent}${middle}(${fmtKg(weight)})`;
    },
  );
}

export function manualTrainingMaxPlan(macro: number, newTm: number): {
  key: `tm_macro${1 | 2 | 3}`;
  value: string;
} {
  if (![1, 2, 3].includes(macro) || !Number.isFinite(newTm) || newTm <= 0) {
    throw new Error("Некорректный TM");
  }
  return {
    key: `tm_macro${macro as 1 | 2 | 3}`,
    value: String(newTm),
  };
}
