import assert from "node:assert/strict";
import test from "node:test";
import { detectCoachRedFlags, redFlagCoachResponse } from "../lib/coach/safety.ts";
import { validateCoachProposal } from "../lib/coach/proposals.ts";
import { COACH_SYSTEM_PROMPT } from "../lib/coach/system-prompt.ts";
import { DEFAULT_GEMINI_MODEL_ID } from "../lib/coach/types.ts";


test("uses the requested stable Gemini 3.5 Flash model id", () => {
  assert.equal(DEFAULT_GEMINI_MODEL_ID, "gemini-3.5-flash");
});


test("local safety gate catches high-signal red-flag language before the model", () => {
  assert.deepEqual(detectCoachRedFlags("У меня внезапно появилась тень как занавес в поле зрения"), [
    "vision",
  ]);
  assert.deepEqual(detectCoachRedFlags("Во время жима появилась боль и давление в груди"), [
    "chest",
  ]);
  assert.deepEqual(detectCoachRedFlags("Нарастающее онемение ноги и не могу начать мочиться"), [
    "neurologic",
  ]);
  const response = redFlagCoachResponse(["chest"]);
  assert.equal(response.proposal, null);
  assert.equal(response.redFlagDetected, true);
  assert.match(response.message, /прекратите тренировку/i);
});


test("ordinary training language does not trigger the local emergency gate", () => {
  assert.deepEqual(
    detectCoachRedFlags("Сегодня плохо спал, разминка была тяжёлая, что уменьшить?"),
    [],
  );
});


test("coach prompt requires explicit confirmation and preserves program invariants", () => {
  assert.match(COACH_SYSTEM_PROMPT, /никогда не изменяешь программу/i);
  assert.match(COACH_SYSTEM_PROMPT, /только после явного нажатия «Подтвердить»/i);
  assert.match(
    COACH_SYSTEM_PROMPT,
    /условные тяжёлые синглы[\s\S]*V9-8[\s\S]*V9-10[\s\S]*V9-12/i,
  );
  assert.match(COACH_SYSTEM_PROMPT, /Красный: никакой тренировки/i);
  assert.match(COACH_SYSTEM_PROMPT, /AMRAP[\s\S]*не добавляются/i);
});


test("proposal validation fails closed on unsafe or over-broad patches", () => {
  const safe = validateCoachProposal({
    kind: "session_adjustment",
    target: "v9-3-b2",
    title: "Снизить нагрузку",
    rationale: "Жёлтая готовность",
    patch: { weightReductionPercent: 2.5, removeWorkingSets: 1 },
    safety: {
      readinessLevel: "yellow",
      respectsProgramInvariants: true,
      warnings: [],
    },
    expiresInHours: 24,
  });
  assert.equal(safe.valid, true);

  const unsafe = validateCoachProposal({
    kind: "session_adjustment",
    target: "v9-3-b2",
    title: "Добавить максимум",
    rationale: "Мотивация",
    patch: { increaseWeightPercent: 10 },
    safety: {
      readinessLevel: "red",
      respectsProgramInvariants: false,
      warnings: [],
    },
    expiresInHours: 24,
  });
  assert.equal(unsafe.valid, false);
  assert.ok(unsafe.errors.includes("program-invariants-not-confirmed"));
  assert.ok(unsafe.errors.includes("unsupported-patch-key:increaseWeightPercent"));
  assert.ok(unsafe.errors.includes("red-readiness-cannot-create-training-change"));
});
