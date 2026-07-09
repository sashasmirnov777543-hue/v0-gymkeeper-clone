import assert from "node:assert/strict";
import test from "node:test";
import {
  elapsedSeconds,
  pauseClock,
  resumeClock,
} from "../lib/cardio-clock.ts";
test("секундомер считает абсолютное время после блокировки", () =>
  assert.equal(
    elapsedSeconds({ accumulatedMs: 5000, runningSince: 10000 }, 75000),
    70,
  ));
test("пауза не добавляет время", () => {
  const p = pauseClock({ accumulatedMs: 5000, runningSince: 10000 }, 20000);
  assert.equal(elapsedSeconds(p, 120000), 15);
  assert.equal(elapsedSeconds(resumeClock(p, 120000), 125500), 20);
});
