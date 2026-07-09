import assert from "node:assert/strict";
import test from "node:test";
import { manualTrainingMaxPlan } from "../lib/training-logic.ts";

test("applyManualTrainingMax формирует ключ выбранного макроцикла", () => {
  assert.deepEqual(manualTrainingMaxPlan(2, 112.5), {
    key: "tm_macro2",
    value: "112.5",
  });
});

test("applyManualTrainingMax отклоняет неверный макроцикл и TM", () => {
  assert.throws(() => manualTrainingMaxPlan(4, 112.5), /Некорректный TM/);
  assert.throws(() => manualTrainingMaxPlan(1, 0), /Некорректный TM/);
});
