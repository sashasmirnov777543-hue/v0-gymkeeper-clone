import assert from "node:assert/strict";
import test from "node:test";
import { assessRhrTrend, median, rhrBaseline } from "../lib/rhr.ts";


test("median and seven-comparable-morning baseline", () => {
  assert.equal(median([70, 60, 65]), 65);
  assert.equal(median([60, 70]), 65);
  const rows = Array.from({ length: 9 }, (_, index) => ({
    measuredOn: `2026-07-${String(index + 1).padStart(2, "0")}`,
    bpm: 60 + index,
    comparable: index !== 7,
  }));
  assert.equal(rhrBaseline(rows), 64);
});


test("two mornings about +5 with poor wellbeing produce a yellow signal", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, index) => ({
      measuredOn: `2026-07-${String(index + 1).padStart(2, "0")}`,
      bpm: 60,
      comparable: true,
      poorWellbeing: false,
    })),
    {
      measuredOn: "2026-07-08",
      bpm: 65,
      comparable: true,
      poorWellbeing: false,
    },
    {
      measuredOn: "2026-07-09",
      bpm: 67,
      repeatedBpm: 66,
      comparable: true,
      poorWellbeing: true,
    },
  ];
  assert.deepEqual(assessRhrTrend(rows), {
    baseline: 60,
    latest: 66,
    delta: 6,
    elevatedComparableMornings: 2,
    yellowSignal: true,
  });
});


test("RHR without wellbeing decline is not an automatic yellow signal", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, index) => ({
      measuredOn: `2026-06-${String(index + 1).padStart(2, "0")}`,
      bpm: 60,
      comparable: true,
    })),
    { measuredOn: "2026-06-08", bpm: 66, comparable: true },
    { measuredOn: "2026-06-09", bpm: 66, comparable: true },
  ];
  assert.equal(assessRhrTrend(rows).yellowSignal, false);
});
