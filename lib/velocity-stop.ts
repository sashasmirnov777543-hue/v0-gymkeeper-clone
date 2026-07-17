export type SetVelocity = "fast" | "normal" | "slow";

export const VELOCITY_STOP_MESSAGE =
  "Скорость упала два подхода подряд — заканчивай упражнение или снизь вес на 5%.";
export const SPEED_DAY_STOP_MESSAGE =
  "Скоростной день: медленный подход — сигнал стоп. Заканчивай упражнение.";

/** Скоростной день определяем по имени упражнения. */
export function isSpeedBench(name: string): boolean {
  return /скоростн/i.test(name);
}

/**
 * Стоп-критерий по скорости: считаем ХВОСТОВЫЕ подряд идущие медленные
 * подходы (если после медленных был быстрый — счётчик сбрасывается).
 * Обычный день: порог 2. Скоростной день: порог 1.
 */
export function shouldStopExercise(
  velocities: Array<string | null | undefined>,
  opts?: { speedDay?: boolean },
): boolean {
  const threshold = opts?.speedDay ? 1 : 2;
  let trailing = 0;
  for (let i = velocities.length - 1; i >= 0; i--) {
    if (velocities[i] === "slow") trailing += 1;
    else break;
  }
  return trailing >= threshold;
}
