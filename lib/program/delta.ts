import {
  DEFAULT_WEIGHT_STEP_KG,
  RMREF_CHECKPOINTS,
  type RmrefCheckpoint,
} from "./rmref.ts";

/**
 * Рабочая надбавка Δ — непрерывная прогрессия между контрольными точками.
 *
 * Зачем она нужна. RMref обновляется раз в 5–7 недель. Между обновлениями вес
 * в карточках стоит на месте, и если человек становится сильнее, программа
 * этого не замечает до следующего замера. В редакции 2.0 авторегуляция работала
 * только вниз: жёлтый статус снимал 2,5–5%, а правила повышения веса не было
 * ни в одном разделе — `recommendWeight` при фиксированной нагрузке возвращал
 * «запас есть, и это по плану, не повышай».
 *
 * Внутри силового блока это давало ровно одно рабочее обновление базы (день 108,
 * второе приходилось уже на тейпер) с потолком +5 кг, то есть максимум +4,3%
 * роста нагрузки при заявленном результате +6…9%. Механика плана не могла выдать
 * то, что обещала.
 *
 * Что это. Δ — оценка разрыва между RMref (бухгалтерский якорь, обновляется редко)
 * и фактической текущей силой. Печатный килограмм = план + Δ.
 * **Инвариант — целевой RPE, а не вес.**
 *
 * Почему это самокорректируется. Если Δ завышен, RPE придёт выше цели — и то же
 * правило откатит вес на следующей сессии. Ошибка живёт максимум одну тренировку
 * вместо пяти недель. Никаких новых измерений не требуется: приложение уже
 * вычисляет, что подход прошёл легче цели, и в 2.0 просто отбрасывало этот сигнал.
 */

/** Шаг изменения надбавки. Тот же, что у блинов. */
export const DELTA_STEP_KG = DEFAULT_WEIGHT_STEP_KG;

/** Коридор надбавки между контрольными точками. */
export const DELTA_MAX_KG = 10;

/** Ниже этого значения продолжать по плану нельзя — нужна досрочная контрольная точка. */
export const DELTA_EARLY_CHECKPOINT_KG = -5;

/** Отклонение RPE от цели, начиная с которого надбавка двигается. */
export const DELTA_RPE_TOLERANCE = 0.5;

/**
 * Циклы, в которых надбавка не повышается: разгрузки и контрольные точки
 * не дают чистого сигнала о силе.
 */
export const DELTA_FROZEN_CYCLE_IDS = [
  "h2-5",
  "h2-9",
  "v9-5",
  "v9-9",
  "v9-11",
  "v9-13",
] as const;

export type DeltaDirection = "up" | "down" | "hold";

export type DeltaState = Readonly<{
  /** Текущая надбавка в килограммах. */
  kg: number;
  /** Цикл, в котором надбавка последний раз повышалась. Одно повышение за цикл. */
  lastRaisedCycleId: string | null;
}>;

export const INITIAL_DELTA: DeltaState = { kg: 0, lastRaisedCycleId: null };

export type DeltaSessionInput = Readonly<{
  state: DeltaState;
  cycleId: string;
  /** Только зелёный статус даёт чистый сигнал. */
  readinessGreen: boolean;
  /** Целевой RPE последнего рабочего подхода по карточке. null — цели нет. */
  targetLastSetRpe: number | null;
  /** Фактический RPE последнего рабочего подхода. */
  actualLastSetRpe: number | null;
  /** Сессия не выполнена в целевом RPE (пропуск подходов, откат веса). */
  sessionUnderperformed?: boolean;
  /** Предыдущая сессия тоже не выполнена — две подряд двигают надбавку вниз. */
  previousSessionUnderperformed?: boolean;
}>;

export type DeltaDecision = Readonly<{
  next: DeltaState;
  direction: DeltaDirection;
  /** Требуется досрочная контрольная точка вместо продолжения по плану. */
  requiresEarlyCheckpoint: boolean;
  reason: string;
}>;

const round1 = (value: number): number => Number(value.toFixed(4));

export function isDeltaFrozenCycle(cycleId: string): boolean {
  return (DELTA_FROZEN_CYCLE_IDS as readonly string[]).includes(cycleId);
}

function clampDelta(kg: number): number {
  return round1(Math.max(-DELTA_MAX_KG, Math.min(DELTA_MAX_KG, kg)));
}

/**
 * Решение по надбавке после сессии.
 *
 * Повышение: зелёный статус и последний рабочий подход вышел на 0,5 RPE ниже цели.
 * Не более одного повышения за цикл, не в разгрузочных циклах.
 *
 * Понижение: последний подход на зелёном вышел на 0,5 RPE выше цели, либо две
 * подряд сессии не выполнены в целевом RPE. Понижение работает в любом цикле —
 * тормоз не должен зависеть от фазы.
 */
export function decideDelta(input: DeltaSessionInput): DeltaDecision {
  const { state, cycleId } = input;
  const hold = (reason: string): DeltaDecision => ({
    next: state,
    direction: "hold",
    requiresEarlyCheckpoint: state.kg <= DELTA_EARLY_CHECKPOINT_KG,
    reason,
  });

  const twoBadSessions =
    input.sessionUnderperformed === true &&
    input.previousSessionUnderperformed === true;

  if (twoBadSessions) {
    return lower(state, "две подряд сессии не выполнены в целевом RPE");
  }

  if (input.targetLastSetRpe === null || input.actualLastSetRpe === null) {
    return hold("нет пары «цель — факт» по последнему рабочему подходу");
  }

  const gap = input.targetLastSetRpe - input.actualLastSetRpe;

  if (gap <= -DELTA_RPE_TOLERANCE) {
    return lower(
      state,
      `последний подход тяжелее цели на ${Math.abs(gap).toFixed(1)} RPE`,
    );
  }

  if (gap < DELTA_RPE_TOLERANCE) {
    return hold("последний подход в целевом коридоре");
  }

  // Дальше только повышение — а у него условий больше.
  if (!input.readinessGreen) {
    return hold("повышение только на зелёном статусе");
  }
  if (isDeltaFrozenCycle(cycleId)) {
    return hold("разгрузка или контрольная точка: надбавка не повышается");
  }
  if (state.lastRaisedCycleId === cycleId) {
    return hold("в этом цикле надбавка уже повышалась");
  }
  if (state.kg >= DELTA_MAX_KG) {
    return hold("надбавка на верхней границе коридора");
  }

  const kg = clampDelta(state.kg + DELTA_STEP_KG);
  return {
    next: { kg, lastRaisedCycleId: cycleId },
    direction: "up",
    requiresEarlyCheckpoint: false,
    reason: `последний подход легче цели на ${gap.toFixed(1)} RPE — надбавка ${formatDelta(kg)}`,
  };
}

function lower(state: DeltaState, why: string): DeltaDecision {
  const kg = clampDelta(state.kg - DELTA_STEP_KG);
  return {
    next: { kg, lastRaisedCycleId: state.lastRaisedCycleId },
    direction: "down",
    requiresEarlyCheckpoint: kg <= DELTA_EARLY_CHECKPOINT_KG,
    reason: `${why} — надбавка ${formatDelta(kg)}`,
  };
}

export type CheckpointFoldInput = Readonly<{
  checkpoint: string;
  state: DeltaState;
  /** RMref, подтверждённый калибровочной тройкой этой точки. */
  confirmedRmrefKg: number;
  /** Выросла ли калибровочная тройка относительно предыдущей. */
  calibrationImproved: boolean;
}>;

export type CheckpointFoldResult = Readonly<{
  next: DeltaState;
  rmrefKg: number;
  /** Надбавка росла, а замер — нет: дрейфуют оценки RPE, а не растёт сила. */
  rpeDriftSuspected: boolean;
  reason: string;
}>;

/**
 * Сворачивание надбавки на контрольной точке.
 *
 * RMref пересчитывается от калибровочной тройки, после чего Δ обнуляется:
 * прогресс поглощён новой базой, и продолжать его учитывать значило бы
 * посчитать одно и то же дважды.
 *
 * Отдельный случай — надбавка накопилась, а тройка не выросла. Это не прогресс,
 * а дрейф оценок RPE: человек привык называть более тяжёлый подход тем же баллом.
 * Тогда база остаётся прежней, надбавка сбрасывается почти в ноль, а пауза
 * и точка касания пересматриваются по видео.
 */
export function foldDeltaAtCheckpoint(
  input: CheckpointFoldInput,
): CheckpointFoldResult {
  if (!RMREF_CHECKPOINTS.includes(input.checkpoint as RmrefCheckpoint)) {
    return {
      next: input.state,
      rmrefKg: input.confirmedRmrefKg,
      rpeDriftSuspected: false,
      reason: "не контрольная точка — надбавка не сворачивается",
    };
  }

  const grewWithoutProof = input.state.kg >= 5 && !input.calibrationImproved;
  if (grewWithoutProof) {
    return {
      next: { kg: DELTA_STEP_KG, lastRaisedCycleId: null },
      rmrefKg: input.confirmedRmrefKg,
      rpeDriftSuspected: true,
      reason:
        "надбавка росла, а калибровочная тройка — нет: пересмотреть паузу и точку касания по видео",
    };
  }

  return {
    next: INITIAL_DELTA,
    rmrefKg: input.confirmedRmrefKg,
    rpeDriftSuspected: false,
    reason: "надбавка свёрнута в RMref и обнулена",
  };
}

/** Вес карточки с учётом надбавки, приведённый к шагу штанги. */
export function applyDelta(
  plannedKg: number | null,
  delta: DeltaState,
  step = DELTA_STEP_KG,
): number | null {
  if (plannedKg === null || !Number.isFinite(plannedKg)) return null;
  const raw = plannedKg + delta.kg;
  if (raw <= 0) return null;
  return Number((Math.round(raw / step) * step).toFixed(4));
}

export function formatDelta(kg: number): string {
  if (kg === 0) return "0 кг";
  const value = String(Math.abs(kg)).replace(".", ",");
  return `${kg > 0 ? "+" : "−"}${value} кг`;
}
