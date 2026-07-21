import assert from "node:assert/strict";
import test from "node:test";
import { decideTechnicalStop } from "../lib/technical-stop.ts";

const base = {
  medicalSymptom: false,
  painChangesMovement: false,
  unsafeLossOfControl: false,
  signs: [] as const,
  rpeAboveTargetByOne: false,
  repeatedAfterReduction: false,
};

test("medical symptom, movement-changing pain or unsafe control stops everything", () => {
  for (const patch of [
    { medicalSymptom: true },
    { painChangesMovement: true },
    { unsafeLossOfControl: true },
  ]) {
    const result = decideTechnicalStop({ ...base, ...patch });
    assert.equal(result.action, "stop_all");
    assert.equal(result.stopSecondaryPressing, true);
  }
});

test("one technical sign reduces weight or one set", () => {
  assert.deepEqual(
    decideTechnicalStop({ ...base, signs: ["asymmetry"] }),
    {
      action: "reduce",
      weightReductionPercent: [2.5, 5],
      removeWorkingSets: 1,
      stopSecondaryPressing: false,
      reasons: ["asymmetry"],
    },
  );
});

test("two signs or repetition after reduction ends primary and secondary pressing", () => {
  assert.equal(
    decideTechnicalStop({
      ...base,
      signs: ["pause_or_touch_lost", "unexpected_slowdown"],
    }).action,
    "stop_primary",
  );
  assert.equal(
    decideTechnicalStop({ ...base, repeatedAfterReduction: true }).action,
    "stop_primary",
  );
});
