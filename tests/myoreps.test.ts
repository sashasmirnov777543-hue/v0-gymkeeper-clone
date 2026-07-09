import test from "node:test"
import assert from "node:assert/strict"
import {
  isMyorepsAllowed,
  isMyorepsEligible,
  myorepsStopReason,
} from "../lib/myoreps.ts"

test("миорепсы показываются только на бицепсе и молотковых", () => {
  assert.equal(isMyorepsEligible("Подъём EZ-штанги на бицепс"), true)
  assert.equal(isMyorepsEligible("Молотковые сгибания"), true)
  assert.equal(isMyorepsEligible("Жим лёжа"), false)
  assert.equal(isMyorepsEligible("Разгибания на трицепс"), false)
  assert.equal(isMyorepsEligible("Сгибания запястий"), false)
})

test("миорепсы выключены в AMRAP, разгрузке и пике V9", () => {
  assert.equal(isMyorepsAllowed("v9", 4), false)
  assert.equal(isMyorepsAllowed("v9", 5), true)
  assert.equal(isMyorepsAllowed("v9", 8), false)
  assert.equal(isMyorepsAllowed("v9", 11), false)
})

test("стоп-правила срабатывают", () => {
  assert.match(myorepsStopReason({ miniSets: 1, lastMiniSetReps: 2, techniqueOk: true, pain: false }) ?? "", /меньше 3/)
  assert.match(myorepsStopReason({ miniSets: 1, lastMiniSetReps: 4, techniqueOk: false, pain: false }) ?? "", /техника/)
  assert.match(myorepsStopReason({ miniSets: 1, lastMiniSetReps: 4, techniqueOk: true, pain: true }) ?? "", /боль/)
  assert.match(myorepsStopReason({ miniSets: 4, lastMiniSetReps: 4, techniqueOk: true, pain: false }) ?? "", /Лимит/)
})
