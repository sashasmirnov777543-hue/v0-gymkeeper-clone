import assert from "node:assert/strict";
import test from "node:test";
import { e1rmForStats, isE1rmExercise } from "../lib/stats.ts";
test("e1RM только для вариантов жима", () => {
  assert.equal(isE1rmExercise("Жим лёжа"), true);
  assert.equal(isE1rmExercise("Спото-жим"), true);
  assert.equal(isE1rmExercise("Сгибания на бицепс"), false);
});
test("e1RM ограничен 1–10 повторами", () => {
  assert.equal(e1rmForStats("Жим лёжа", 100, 5), 116.7);
  assert.equal(e1rmForStats("Жим лёжа", 80, 12), null);
  assert.equal(e1rmForStats("Разгибания на трицепс", 40, 8), null);
});
