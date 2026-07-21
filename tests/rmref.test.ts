import assert from "node:assert/strict";
import test from "node:test";
import {
  e1rmFromStandardTriple,
  reviewRmrefUpdate,
  roundToStepHalfDown,
  weightFromRmrefPercent,
  weightRangeFromRmref,
} from "../lib/program/rmref.ts";


test("rounds to 2.5 kg and resolves exact midpoints downward", () => {
  assert.equal(roundToStepHalfDown(46), 45);
  assert.equal(roundToStepHalfDown(63.25), 62.5);
  assert.equal(roundToStepHalfDown(69), 70);
  assert.equal(roundToStepHalfDown(71.875), 72.5);
  assert.equal(roundToStepHalfDown(80.5), 80);
  assert.equal(roundToStepHalfDown(89.125), 90);
  assert.equal(roundToStepHalfDown(103.5), 102.5);
});


test("calculates the PDF control table from RMref 115", () => {
  const expected = new Map([
    [40, 45],
    [55, 62.5],
    [60, 70],
    [62.5, 72.5],
    [65, 75],
    [67.5, 77.5],
    [70, 80],
    [72.5, 82.5],
    [75, 85],
    [77.5, 90],
    [80, 92.5],
    [82.5, 95],
    [85, 97.5],
    [87.5, 100],
    [90, 102.5],
  ]);
  for (const [percent, kg] of expected) {
    assert.equal(weightFromRmrefPercent(115, percent), kg, `${percent}%`);
  }
  assert.deepEqual(weightRangeFromRmref(115, { min: 65, max: 67.5 }), {
    min: 75,
    max: 77.5,
  });
});


test("standard triple e1RM is weight times 1.10", () => {
  assert.equal(e1rmFromStandardTriple(110), 121);
});


test("RMref can increase only at three checkpoints with two distinct confirmations", () => {
  const evidence = [
    {
      sessionId: 1,
      comparableTechnique: true,
      comparablePause: true,
      comparableTouchPoint: true,
      improvementConfirmed: true,
    },
    {
      sessionId: 2,
      comparableTechnique: true,
      comparablePause: true,
      comparableTouchPoint: true,
      improvementConfirmed: true,
    },
  ];
  for (const checkpoint of ["h2-9", "v9-4", "v9-8"]) {
    assert.deepEqual(
      reviewRmrefUpdate({
        checkpoint,
        currentRmrefKg: 115,
        proposedRmrefKg: 117.5,
        evidence,
      }),
      { allowed: true, nextRmrefKg: 117.5, reasons: [] },
    );
  }

  const oneConfirmation = reviewRmrefUpdate({
    checkpoint: "h2-9",
    currentRmrefKg: 115,
    proposedRmrefKg: 117.5,
    evidence: [evidence[0], { ...evidence[0] }],
  });
  assert.equal(oneConfirmation.allowed, false);
  assert.ok(oneConfirmation.reasons.includes("two-comparable-confirmations-required"));

  const wrongCheckpoint = reviewRmrefUpdate({
    checkpoint: "v9-5",
    currentRmrefKg: 115,
    proposedRmrefKg: 117.5,
    evidence,
  });
  assert.equal(wrongCheckpoint.allowed, false);
  assert.ok(wrongCheckpoint.reasons.includes("not-an-rmref-checkpoint"));

  const jump = reviewRmrefUpdate({
    checkpoint: "v9-4",
    currentRmrefKg: 115,
    proposedRmrefKg: 120,
    evidence,
  });
  assert.equal(jump.allowed, false);
  assert.ok(jump.reasons.includes("increase-exceeds-2.5-kg"));
});
