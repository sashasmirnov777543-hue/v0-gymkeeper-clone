/**
 * Оценка усилия по наблюдаемому событию, а не по ощущению.
 *
 * Различать RPE 7,5 и 8 на ощупь не может почти никто: в мета-анализе Halperin (2022)
 * запас повторов систематически занижается примерно на один, у Zourdos (2016)
 * стандартное отклонение оценки около 0,7 балла. Требовать попадания в полбалла —
 * значит требовать точности, которой у инструмента нет.
 *
 * Поэтому спрашиваем не число, а что произошло с последним повтором. Скорость,
 * залипание и дожим — наблюдаемые события, их видно и снаружи, и изнутри.
 *
 * Соответствие событий баллам RPE — это соглашение, а не измерение. Но соглашение,
 * которое воспроизводится одинаково через полгода, а именно это и требуется от мерки:
 * показатель программы — тренд из шести замеров одним прибором, и систематическое
 * смещение в нём вычитается само.
 */
export type LastRepObservation =
  | "same_speed"
  | "slower"
  | "sticking_passed"
  | "grind_or_form_loss";

export type EffortOption = Readonly<{
  id: LastRepObservation;
  label: string;
  hint: string;
  rpe: number;
  /** Наблюдение — это по сути скорость штанги, поэтому заполняем и её. */
  velocity: "fast" | "normal" | "slow";
}>;

export const LAST_REP_OBSERVATIONS: readonly EffortOption[] = [
  {
    id: "same_speed",
    label: "Шёл как первый",
    hint: "скорость не изменилась",
    rpe: 6,
    velocity: "fast",
  },
  {
    id: "slower",
    label: "Заметно медленнее",
    hint: "но ровно, без остановки",
    rpe: 7.5,
    velocity: "normal",
  },
  {
    id: "sticking_passed",
    label: "Залип, но прошёл",
    hint: "встал на мгновение и пошёл сам",
    rpe: 8,
    velocity: "slow",
  },
  {
    id: "grind_or_form_loss",
    label: "Дожимал",
    hint: "или поехали пауза, касание, траектория",
    rpe: 9,
    velocity: "slow",
  },
];

export function effortOption(id: LastRepObservation): EffortOption {
  const found = LAST_REP_OBSERVATIONS.find((item) => item.id === id);
  if (!found) throw new RangeError(`unknown observation: ${id}`);
  return found;
}

/** Обратное соответствие — чтобы подсветить выбранное, если RPE уже проставлен. */
export function observationFromRpe(rpe: number | null): LastRepObservation | null {
  if (rpe == null) return null;
  if (rpe <= 6.5) return "same_speed";
  if (rpe < 8) return "slower";
  if (rpe < 8.75) return "sticking_passed";
  return "grind_or_form_loss";
}

/**
 * Целевое наблюдение для планового RPE.
 * Нужно, чтобы подсветить в интерфейсе, какое событие соответствует цели карточки.
 */
export function targetObservation(targetRpe: number | null): LastRepObservation | null {
  return observationFromRpe(targetRpe);
}
