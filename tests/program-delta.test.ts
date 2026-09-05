import assert from "node:assert/strict";
import test from "node:test";
import {
  DELTA_MAX_KG,
  DELTA_STEP_KG,
  INITIAL_DELTA,
  applyDelta,
  decideDelta,
  foldDeltaAtCheckpoint,
  formatDelta,
  isDeltaFrozenCycle,
  type DeltaState,
} from "../lib/program/delta.ts";
import { recommendWeight } from "../lib/recommend.ts";

const green = (state: DeltaState, cycleId: string, target: number, actual: number) =>
  decideDelta({
    state,
    cycleId,
    readinessGreen: true,
    targetLastSetRpe: target,
    actualLastSetRpe: actual,
  });

test("подход легче цели на зелёном поднимает надбавку на один шаг", () => {
  const decision = green(INITIAL_DELTA, "v9-2", 7.6, 7);
  assert.equal(decision.direction, "up");
  assert.equal(decision.next.kg, DELTA_STEP_KG);
  assert.equal(decision.next.lastRaisedCycleId, "v9-2");
});

test("попадание в целевой коридор ничего не двигает", () => {
  const decision = green({ kg: 2.5, lastRaisedCycleId: "v9-2" }, "v9-3", 7.6, 7.4);
  assert.equal(decision.direction, "hold");
  assert.equal(decision.next.kg, 2.5);
});

test("подход тяжелее цели опускает надбавку — и это работает в любом цикле", () => {
  const decision = green({ kg: 5, lastRaisedCycleId: "v9-3" }, "v9-5", 7.6, 8.2);
  assert.equal(decision.direction, "down");
  assert.equal(decision.next.kg, 2.5);
  // Тормоз не зависит от фазы: разгрузка не мешает снизить вес.
  assert.ok(isDeltaFrozenCycle("v9-5"));
});

test("повышение — не чаще одного раза за цикл", () => {
  const first = green(INITIAL_DELTA, "v9-2", 7.6, 7);
  assert.equal(first.direction, "up");
  const second = green(first.next, "v9-2", 7.6, 7);
  assert.equal(second.direction, "hold");
  assert.match(second.reason, /уже повышалась/);
});

test("на разгрузке и контрольной точке надбавка не растёт", () => {
  for (const cycleId of ["h2-5", "h2-9", "v9-5", "v9-9", "v9-11", "v9-13"]) {
    const decision = green(INITIAL_DELTA, cycleId, 7.6, 6.5);
    assert.equal(decision.direction, "hold", cycleId);
  }
});

test("жёлтый статус не даёт повышения, но не мешает снижению", () => {
  const up = decideDelta({
    state: INITIAL_DELTA,
    cycleId: "v9-3",
    readinessGreen: false,
    targetLastSetRpe: 7.6,
    actualLastSetRpe: 6.8,
  });
  assert.equal(up.direction, "hold");

  const down = decideDelta({
    state: { kg: 5, lastRaisedCycleId: null },
    cycleId: "v9-3",
    readinessGreen: false,
    targetLastSetRpe: 7.6,
    actualLastSetRpe: 8.3,
  });
  assert.equal(down.direction, "down");
});

test("две подряд невыполненные сессии опускают надбавку без сравнения RPE", () => {
  const decision = decideDelta({
    state: { kg: 5, lastRaisedCycleId: "v9-3" },
    cycleId: "v9-4",
    readinessGreen: true,
    targetLastSetRpe: null,
    actualLastSetRpe: null,
    sessionUnderperformed: true,
    previousSessionUnderperformed: true,
  });
  assert.equal(decision.direction, "down");
  assert.equal(decision.next.kg, 2.5);
});

test("коридор надбавки ограничен и снизу требует досрочной контрольной точки", () => {
  let state: DeltaState = { kg: DELTA_MAX_KG, lastRaisedCycleId: null };
  assert.equal(green(state, "v9-4", 7.6, 6.5).direction, "hold");

  state = { kg: -2.5, lastRaisedCycleId: null };
  const decision = green(state, "v9-4", 7.6, 8.4);
  assert.equal(decision.next.kg, -5);
  assert.equal(decision.requiresEarlyCheckpoint, true);
});

test("на контрольной точке надбавка сворачивается в RMref и обнуляется", () => {
  const result = foldDeltaAtCheckpoint({
    checkpoint: "v9-5",
    state: { kg: 5, lastRaisedCycleId: "v9-4" },
    confirmedRmrefKg: 120,
    calibrationImproved: true,
  });
  assert.deepEqual(result.next, INITIAL_DELTA);
  assert.equal(result.rmrefKg, 120);
  assert.equal(result.rpeDriftSuspected, false);
});

test("надбавка выросла, а замер нет — это дрейф оценок, а не сила", () => {
  const result = foldDeltaAtCheckpoint({
    checkpoint: "v9-5",
    state: { kg: 7.5, lastRaisedCycleId: "v9-4" },
    confirmedRmrefKg: 115,
    calibrationImproved: false,
  });
  assert.equal(result.rpeDriftSuspected, true);
  assert.equal(result.next.kg, DELTA_STEP_KG);
  assert.match(result.reason, /видео/);
});

test("надбавка применяется к весу карточки по шагу штанги", () => {
  assert.equal(applyDelta(97.5, { kg: 2.5, lastRaisedCycleId: null }), 100);
  assert.equal(applyDelta(97.5, { kg: -5, lastRaisedCycleId: null }), 92.5);
  assert.equal(applyDelta(null, { kg: 5, lastRaisedCycleId: null }), null);
  assert.equal(formatDelta(0), "0 кг");
  assert.equal(formatDelta(2.5), "+2,5 кг");
  assert.equal(formatDelta(-5), "−5 кг");
});

test("рекомендация веса отдаёт сигнал наверх вместо запрета повышать", () => {
  // Редакция 2.0 возвращала «запас есть, и это по плану, не повышай» и на этом
  // теряла сигнал. Вес по-прежнему не меняется самовольно, но факт запаса
  // передаётся дальше — решение принимает decideDelta.
  const light = recommendWeight([{ weight: 95, reps: 3, rir: 5 }], 1, 2, 95, {
    fixedLoad: true,
  });
  assert.equal(light?.weight, 95);
  assert.equal(light?.direction, "same");
  assert.equal(light?.suggestDeltaRaise, true);

  // На верхней границе коридора сигнала нет: дальше решает контрольная точка.
  const capped = recommendWeight([{ weight: 95, reps: 3, rir: 5 }], 1, 2, 95, {
    fixedLoad: true,
    deltaKg: DELTA_MAX_KG,
  });
  assert.equal(capped?.suggestDeltaRaise, false);
  assert.match(capped?.reason ?? "", /коридора/);
});
