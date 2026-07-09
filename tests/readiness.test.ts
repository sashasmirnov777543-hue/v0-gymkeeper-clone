import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustedCardioMinutes,
  isIsolationExercise,
  readinessLevel,
} from "../lib/training-logic.ts";

const base = {
  sleepMinutes: 480,
  sleepQuality: 5,
  morningPulseDelta: 0,
  shoulderPain: 0,
  backPain: 0,
  energy: 5,
};
test("готовность зелёная при хорошем восстановлении", () =>
  assert.equal(readinessLevel(base), "green"));
test("сильная боль всегда даёт красный", () =>
  assert.equal(readinessLevel({ ...base, shoulderPain: 8 }), "red"));
test("накопленная усталость включает мини-тейпер", () =>
  assert.equal(
    readinessLevel({
      ...base,
      sleepMinutes: 280,
      sleepQuality: 2,
      morningPulseDelta: 12,
      energy: 2,
    }),
    "orange",
  ));
test("кардио сокращается на оранжевом и красном", () => {
  assert.equal(adjustedCardioMinutes(40, "orange"), 28);
  assert.equal(adjustedCardioMinutes(40, "red"), 20);
});
test("изоляция распознаётся без скрытия жима", () => {
  assert.equal(isIsolationExercise("Сгибания на бицепс"), true);
  assert.equal(isIsolationExercise("Жим лёжа"), false);
});
