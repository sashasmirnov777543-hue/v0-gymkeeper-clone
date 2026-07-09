import test from "node:test"
import assert from "node:assert/strict"
import { epley1RM, recalcWeightText, roundToStep, trainingMaxFromAmrap, weightFromPercent } from "../lib/training-logic.ts"

test("93.5 × 10 gives e1RM 124.7 and TM 112.5", () => {
  const result = trainingMaxFromAmrap(93.5, 10)
  assert.equal(Math.round(result.e1rm * 10) / 10, 124.7)
  assert.equal(result.tm, 112.5)
})

test("rounding is consistently 2.5 kg", () => {
  assert.equal(roundToStep(112.2), 112.5)
  assert.equal(weightFromPercent(85, 112.5), 95)
  assert.equal(weightFromPercent(87.5, 112.5), 97.5)
})

test("program text is recalculated from TM", () => {
  assert.equal(recalcWeightText("80 % (95), RPE 8", 112.5), "80 % (90), RPE 8")
  assert.equal(recalcWeightText("88 % (104) → 92 % (109)" , 112.5), "88 % (100) → 92 % (102,5)")
})

test("Epley rejects invalid inputs", () => {
  assert.throws(() => epley1RM(0, 10))
  assert.throws(() => epley1RM(100, 0))
})
