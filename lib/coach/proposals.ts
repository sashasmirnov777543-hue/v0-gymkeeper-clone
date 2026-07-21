import type { CoachProposal } from "./types.ts";

const ALLOWED_KINDS = new Set<CoachProposal["kind"]>([
  "session_adjustment",
  "recovery_days",
  "cardio_adjustment",
  "rmref_review",
  "test_postponement",
  "note_only",
]);

const PATCH_KEYS: Record<CoachProposal["kind"], readonly string[]> = {
  session_adjustment: [
    "weightReductionPercent",
    "removeWorkingSets",
    "techniqueOnly",
    "skipOptionalExerciseIds",
    "stopSecondaryPressing",
  ],
  recovery_days: ["afterProgramDay", "days", "reason"],
  cardio_adjustment: ["minutes", "zone", "replaceWithWalk", "skip"],
  rmref_review: ["checkpoint", "proposedRmrefKg", "evidenceSessionIds"],
  test_postponement: ["delayHours", "delayDays", "endBlockWithoutTest"],
  note_only: ["note"],
};

export type ProposalValidation = Readonly<{
  valid: boolean;
  errors: readonly string[];
}>;

export function validateCoachProposal(proposal: CoachProposal): ProposalValidation {
  const errors: string[] = [];
  if (!ALLOWED_KINDS.has(proposal.kind)) errors.push("unsupported-kind");
  if (!proposal.target.trim()) errors.push("missing-target");
  if (!proposal.title.trim()) errors.push("missing-title");
  if (!proposal.rationale.trim()) errors.push("missing-rationale");
  if (proposal.safety.respectsProgramInvariants !== true) {
    errors.push("program-invariants-not-confirmed");
  }
  if (
    !Number.isFinite(proposal.expiresInHours) ||
    proposal.expiresInHours < 1 ||
    proposal.expiresInHours > 168
  ) {
    errors.push("invalid-expiry");
  }
  const keys = Object.keys(proposal.patch);
  const allowed = new Set(PATCH_KEYS[proposal.kind] ?? []);
  for (const key of keys) {
    if (!allowed.has(key)) errors.push(`unsupported-patch-key:${key}`);
  }

  if (proposal.kind === "recovery_days") {
    const days = proposal.patch.days;
    const after = proposal.patch.afterProgramDay;
    if (!Number.isInteger(days) || Number(days) < 1 || Number(days) > 4) {
      errors.push("recovery-days-must-be-1-to-4");
    }
    if (!Number.isInteger(after) || Number(after) < 1 || Number(after) > 176) {
      errors.push("invalid-recovery-anchor");
    }
  }
  if (proposal.kind === "session_adjustment") {
    const reduction = proposal.patch.weightReductionPercent;
    if (
      reduction !== undefined &&
      reduction !== 2.5 &&
      reduction !== 5
    ) {
      errors.push("weight-reduction-must-be-2.5-or-5");
    }
    const remove = proposal.patch.removeWorkingSets;
    if (remove !== undefined && remove !== 1) {
      errors.push("only-one-working-set-may-be-removed");
    }
  }
  if (proposal.kind === "cardio_adjustment") {
    const zone = proposal.patch.zone;
    if (zone !== undefined && zone !== "Z1" && zone !== "Z2") {
      errors.push("invalid-cardio-zone");
    }
    const minutes = proposal.patch.minutes;
    if (
      minutes !== undefined &&
      (!Number.isFinite(minutes) || Number(minutes) < 0 || Number(minutes) > 60)
    ) {
      errors.push("invalid-cardio-minutes");
    }
  }
  if (proposal.kind === "rmref_review") {
    const checkpoint = proposal.patch.checkpoint;
    if (!new Set(["h2-9", "v9-4", "v9-8"]).has(String(checkpoint))) {
      errors.push("invalid-rmref-checkpoint");
    }
    const evidence = proposal.patch.evidenceSessionIds;
    if (!Array.isArray(evidence) || new Set(evidence.map(String)).size < 2) {
      errors.push("two-distinct-evidence-sessions-required");
    }
  }
  if (proposal.safety.readinessLevel === "red" && proposal.kind !== "note_only") {
    errors.push("red-readiness-cannot-create-training-change");
  }

  return { valid: errors.length === 0, errors };
}
