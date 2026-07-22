export const COACH_MODEL_NAME = "Gemini 3.5 Flash";
export const DEFAULT_GEMINI_MODEL_ID = "gemini-3.5-flash";

export type CoachRole = "user" | "assistant";

export type CoachMessage = Readonly<{
  role: CoachRole;
  content: string;
}>;

export type CoachProposalKind =
  | "session_adjustment"
  | "recovery_days"
  | "cardio_adjustment"
  | "rmref_review"
  | "test_postponement"
  | "note_only";

export type CoachProposal = Readonly<{
  kind: CoachProposalKind;
  target: string;
  title: string;
  rationale: string;
  patch: Readonly<Record<string, unknown>>;
  safety: Readonly<{
    readinessLevel?: "green" | "yellow" | "orange" | "red";
    respectsProgramInvariants: boolean;
    requiresMedicalReview?: boolean;
    warnings: readonly string[];
  }>;
  expiresInHours: number;
}>;

export type CoachStructuredResponse = Readonly<{
  message: string;
  questions: readonly string[];
  proposal: CoachProposal | null;
  redFlagDetected: boolean;
}>;

export type CoachRuntimeContext = Readonly<{
  now: string;
  programVersion: string;
  programDay: number | null;
  currentBlock: "h2" | "v9" | null;
  currentCycle: number | null;
  currentSlot: string | null;
  rmrefKg: number;
  readiness: unknown;
  rhrTrend: unknown;
  recentSessions: readonly unknown[];
  pendingProposals: readonly unknown[];
}>;
