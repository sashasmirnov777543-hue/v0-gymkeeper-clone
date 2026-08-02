import assert from "node:assert/strict";
import test from "node:test";
import {
  RMREF_CHECKPOINTS,
  RMREF_MAX_STEP_KG,
  STANDARD_TRIPLE_RPE8_FACTOR,
  e1rmFromStandardTriple,
  reviewRmrefUpdate,
  rmrefFromCalibrationTriple,
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


test("standard triple e1RM divides by the RPE 8 factor instead of Epley", () => {
  assert.equal(STANDARD_TRIPLE_RPE8_FACTOR, 0.863);
  assert.equal(e1rmFromStandardTriple(110), 127.4623);
  assert.equal(e1rmFromStandardTriple(100), 115.8749);
  // Прежняя формула Эпли дала бы 121 кг и занизила бы результат примерно на 5%.
  assert.notEqual(e1rmFromStandardTriple(110), 121);
});


test("RMref derived from a calibration triple rounds down to the 2.5 kg step", () => {
  assert.equal(rmrefFromCalibrationTriple(110), 125);
  assert.equal(rmrefFromCalibrationTriple(100), 115);
  assert.equal(rmrefFromCalibrationTriple(99.25), 115);
  assert.equal(rmrefFromCalibrationTriple(115), 132.5);
  assert.equal(rmrefFromCalibrationTriple(120), 137.5);
  assert.equal(rmrefFromCalibrationTriple(110, 5), 125);
});


test("RMref changes only at the six checkpoints, by at most 5 kg in either direction", () => {
  assert.deepEqual(RMREF_CHECKPOINTS, ["h2-1", "h2-5", "h2-9", "v9-5", "v9-11", "v9-13"]);
  assert.equal(RMREF_MAX_STEP_KG, 5);

  const evidence = [
    {
      sessionId: 1,
      comparableTechnique: true,
      comparablePause: true,
      comparableTouchPoint: true,
      improvementConfirmed: true,
    },
  ];

  for (const checkpoint of RMREF_CHECKPOINTS) {
    assert.deepEqual(
      reviewRmrefUpdate({
        checkpoint,
        currentRmrefKg: 115,
        proposedRmrefKg: 117.5,
        evidence,
      }),
      { allowed: true, nextRmrefKg: 117.5, reasons: [] },
      checkpoint,
    );
  }

  // Редакция 2.0: снижение разрешено наравне с повышением.
  assert.deepEqual(
    reviewRmrefUpdate({
      checkpoint: "v9-11",
      currentRmrefKg: 115,
      proposedRmrefKg: 110,
      evidence,
    }),
    { allowed: true, nextRmrefKg: 110, reasons: [] },
  );

  const wrongCheckpoint = reviewRmrefUpdate({
    checkpoint: "v9-4",
    currentRmrefKg: 115,
    proposedRmrefKg: 117.5,
    evidence,
  });
  assert.equal(wrongCheckpoint.allowed, false);
  assert.ok(wrongCheckpoint.reasons.includes("not-an-rmref-checkpoint"));

  for (const proposedRmrefKg of [122.5, 107.5]) {
    const jump = reviewRmrefUpdate({
      checkpoint: "h2-9",
      currentRmrefKg: 115,
      proposedRmrefKg,
      evidence,
    });
    assert.equal(jump.allowed, false, String(proposedRmrefKg));
    assert.ok(jump.reasons.includes("change-exceeds-5-kg"), String(proposedRmrefKg));
    assert.equal(jump.nextRmrefKg, 115);
  }

  const offStep = reviewRmrefUpdate({
    checkpoint: "h2-9",
    currentRmrefKg: 115,
    proposedRmrefKg: 116,
    evidence,
  });
  assert.equal(offStep.allowed, false);
  assert.ok(offStep.reasons.includes("change-must-use-2.5-kg-step"));
});


test("a single comparable calibration is enough to move RMref", () => {
  const comparable = {
    sessionId: 1,
    comparableTechnique: true,
    comparablePause: true,
    comparableTouchPoint: true,
    improvementConfirmed: true,
  };

  assert.deepEqual(
    reviewRmrefUpdate({
      checkpoint: "h2-9",
      currentRmrefKg: 115,
      proposedRmrefKg: 117.5,
      evidence: [comparable],
    }),
    { allowed: true, nextRmrefKg: 117.5, reasons: [] },
  );

  const noEvidence = reviewRmrefUpdate({
    checkpoint: "h2-9",
    currentRmrefKg: 115,
    proposedRmrefKg: 117.5,
    evidence: [],
  });
  assert.equal(noEvidence.allowed, false);
  assert.ok(noEvidence.reasons.includes("comparable-calibration-required"));

  const notComparable = reviewRmrefUpdate({
    checkpoint: "h2-9",
    currentRmrefKg: 115,
    proposedRmrefKg: 117.5,
    evidence: [{ ...comparable, comparablePause: false }],
  });
  assert.equal(notComparable.allowed, false);
  assert.ok(notComparable.reasons.includes("comparable-calibration-required"));

  // Подтверждение не требуется, когда RMref остаётся прежним.
  assert.deepEqual(
    reviewRmrefUpdate({
      checkpoint: "h2-9",
      currentRmrefKg: 115,
      proposedRmrefKg: 115,
      evidence: [],
    }),
    { allowed: true, nextRmrefKg: 115, reasons: [] },
  );
});
