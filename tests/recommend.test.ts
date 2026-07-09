import assert from "node:assert/strict";
import test from "node:test";
import { recommendWeight } from "../lib/recommend.ts";

test("recommendWeight держит вес внутри целевого RIR", () => {
  assert.deepEqual(recommendWeight(
    [{ weight: 80, reps: 8, rir: 2 }], 1, 3, 80,
  ), {
    weight: 80,
    reason: "RIR 2 в цели 1–3 — держи вес",
    direction: "same",
  });
});

test("recommendWeight повышает и снижает максимум на два шага", () => {
  assert.equal(recommendWeight([{ weight: 80, reps: 8, rir: 5 }], 1, 2, 80)?.weight, 85);
  assert.equal(recommendWeight([{ weight: 80, reps: 8, rir: 0 }], 3, 4, 80)?.weight, 75);
});

test("фиксированная нагрузка не растёт выше программы", () => {
  const result = recommendWeight([{ weight: 80, reps: 8, rir: 5 }], 1, 2, 80, { fixedLoad: true });
  assert.equal(result?.weight, 80);
  assert.equal(result?.direction, "same");
});
