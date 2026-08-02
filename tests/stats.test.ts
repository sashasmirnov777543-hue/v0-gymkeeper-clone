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
test("тройка считается делением на 0,863, а не по Эпли", () => {
  // Редакция 2.0: стандартизированная тройка @RPE 8 — это 86,3% от 1ПМ.
  assert.equal(e1rmForStats("Жим лёжа", 100, 3), 115.9);
  assert.equal(e1rmForStats("Жим лёжа", 110, 3), 127.5);
  // Эпли дала бы 110 кг для тройки со 100 кг — эта формула больше не применяется.
  assert.notEqual(e1rmForStats("Жим лёжа", 100, 3), 110);
  // Одиночный повтор остаётся самим весом.
  assert.equal(e1rmForStats("Жим лёжа", 100, 1), 100);
});
