import test from "node:test";
import assert from "node:assert/strict";
import {
  LAST_REP_OBSERVATIONS,
  effortOption,
  observationFromRpe,
  targetObservation,
} from "../lib/effort.ts";

test("наблюдаемые события покрывают шкалу усилия без разрывов", () => {
  assert.equal(LAST_REP_OBSERVATIONS.length, 4);
  const rpes = LAST_REP_OBSERVATIONS.map((item) => item.rpe);
  // Строго возрастают: каждое следующее событие тяжелее предыдущего.
  assert.deepEqual(rpes, [...rpes].sort((a, b) => a - b));
  assert.equal(new Set(rpes).size, rpes.length);
  // Ни одно событие не выходит за потолок программы, кроме «дожимал» — оно и означает превышение.
  assert.ok(rpes.filter((value) => value <= 8).length === 3);
});

test("целевое событие программы — залипание без дожима", () => {
  // Все шесть контрольных точек редакции 2.0 идут на RPE 8.
  assert.equal(targetObservation(8), "sticking_passed");
  assert.equal(effortOption("sticking_passed").rpe, 8);
  assert.equal(effortOption("sticking_passed").velocity, "slow");
});

test("обратное соответствие RPE в событие однозначно", () => {
  assert.equal(observationFromRpe(null), null);
  assert.equal(observationFromRpe(5), "same_speed");
  assert.equal(observationFromRpe(6), "same_speed");
  assert.equal(observationFromRpe(7), "slower");
  assert.equal(observationFromRpe(7.5), "slower");
  assert.equal(observationFromRpe(8), "sticking_passed");
  assert.equal(observationFromRpe(8.5), "sticking_passed");
  assert.equal(observationFromRpe(9), "grind_or_form_loss");
  assert.equal(observationFromRpe(10), "grind_or_form_loss");
});

test("каждое событие переводится в скорость штанги без потери данных", () => {
  for (const option of LAST_REP_OBSERVATIONS) {
    assert.ok(["fast", "normal", "slow"].includes(option.velocity));
    // Событие восстанавливается из записанного RPE — значит логи остаются читаемыми.
    assert.equal(observationFromRpe(option.rpe), option.id);
  }
});
