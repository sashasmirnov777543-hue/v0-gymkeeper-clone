"use client";
import type { LoggedSetLite } from "./recommend.ts";
import { assessReadiness, type ReadinessInput } from "./readiness.ts";
import { dedupeOperationsById } from "./offline-dedup.ts";
import { ACTIVE_PROGRAM_VERSION } from "./program/version.ts";
import {
  safetyProfile,
  sessionStartReasons,
  type SafetyProfile,
} from "./program/policy.ts";
import {
  prepareExercises,
  type PreparedExercise,
  type ExerciseInput,
} from "./program/session-plan.ts";

const PROGRAM_KEY = `gym:program:${ACTIVE_PROGRAM_VERSION}`;
const LEGACY_KEYS = [
  "gym:program:h2-v9-1.0",
  "gym:program:h2-v9-2.0",
  "gym:program:h2-v9-3.0",
];
const OUTBOX_KEY = "gym:outbox";
const LOCAL_SESSIONS_KEY = "gym:local-sessions";
const LOCAL_SETS_PREFIX = "gym:local-sets:";
let flushing = false;

export type OfflineStartChecks = {
  branch?: "triple" | "direct_1rm";
  spotterPresent?: boolean;
  safetiesSet?: boolean;
  readinessReviewed?: boolean;
};
export type CachedExercise = ExerciseInput & {
  workoutId: number;
  condition?: string | null;
};
export type CachedWorkout = {
  id: number;
  cycleId: number;
  label: string;
  title: string;
  notes: string | null;
  kind: string;
  cardioZone: string | null;
  cardioMinutes: string | null;
  prescription?: unknown;
  branches?: unknown;
  exercises: CachedExercise[];
};
export type CachedCycle = {
  id: number;
  number: number;
  name: string;
  macrocycle: number;
  block?: string;
  notes: string | null;
  workouts: CachedWorkout[];
};
export type ProgramCache = {
  cachedAt: string;
  programVersion: string;
  cycles: CachedCycle[];
  lastSetsByName: Record<string, LoggedSetLite[]>;
  baseKg?: number;
  safetyProfile?: SafetyProfile;
};
export type LocalSnapshot = {
  profile: SafetyProfile;
  baseKg: number;
  exercises: PreparedExercise[];
  workout: CachedWorkout;
  cycle: CachedCycle;
};
type LocalSession = {
  workoutId: number;
  startedAt: string;
  readiness?: ReadinessInput;
  programVersion?: string;
  snapshot?: LocalSnapshot;
  remoteId?: number;
  finishedAt?: string;
};

export type OutboxPayload =
  | {
      kind: "start";
      localKey: string;
      workoutId: number;
      startedAt: string;
      readiness?: ReadinessInput;
      startChecks?: OfflineStartChecks;
      programVersion?: string;
      reportedBaseKg?: number;
    }
  | {
      kind: "set";
      sessionRef: number | string;
      workoutExerciseId: number;
      setNumber: number;
      weight: number | null;
      reps: number | null;
      rir: number | null;
      rpe: number | null;
      velocity: "fast" | "normal" | "slow" | null;
      stickingPoint: "chest" | "middle" | "lockout" | null;
      isWarmup?: boolean;
      pauseQuality?: "clean" | "short" | "lost" | null;
      touchPoint?: "stable" | "high" | "low" | "variable" | null;
      trajectoryQuality?: "clean" | "asymmetric" | "deviated" | null;
      techniqueSigns?: string[];
      painScore?: number | null;
      symptoms?: string[];
      videoUrl?: string | null;
    }
  | {
      kind: "updateSet";
      sessionRef: number | string;
      setId: number;
      weight: number | null;
      reps: number | null;
      rir: number | null;
      rpe: number | null;
    }
  | {
      kind: "finish";
      sessionRef: number | string;
      finishedAt: string;
    }
  | {
      kind: "cardioFinish";
      sessionRef: number | string;
      finishedAt: string;
      durationSeconds: number;
      avgHr: number | null;
      speed: string | null;
      resistance: string | null;
      modality?: string | null;
      warmupMinutes?: number | null;
      mainMinutes?: number | null;
      cooldownMinutes?: number | null;
      supportLog?: { completedIds: number[]; mode: number };
      cardioRpe: number | null;
      cardioTalkTest: "full_sentences" | "short_phrases" | "difficult" | null;
      cardioSymptoms: string | null;
    }
  | { kind: "cancel"; sessionRef: number | string }
  | { kind: "deleteSet"; setId: number };

export type OutboxOp = OutboxPayload & { operationId: string };

export type LocalSetRow = {
  id: number;
  workoutExerciseId: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
  velocity?: string | null;
  stickingPoint?: string | null;
  isWarmup?: boolean;
  pauseQuality?: string | null;
  touchPoint?: string | null;
  trajectoryQuality?: string | null;
  techniqueSigns?: unknown;
  painScore?: number | null;
  symptoms?: unknown;
  videoUrl?: string | null;
};

export function cacheProgram(data: Omit<ProgramCache, "cachedAt">) {
  try {
    localStorage.setItem(
      `gym:program:${data.programVersion}`,
      JSON.stringify({ ...data, cachedAt: new Date().toISOString() }),
    );
  } catch {
    /* Existing cache/outbox remains intact. */
  }
}
export function loadProgram(): ProgramCache | null {
  try {
    const raw = localStorage.getItem(PROGRAM_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ProgramCache;
    return p.programVersion === ACTIVE_PROGRAM_VERSION &&
      Array.isArray(p.cycles)
      ? p
      : null;
  } catch {
    return null;
  }
}
/** Do not purge an older cache that may still be needed by an unfinished session. */
export function loadProgramForWorkout(workoutId: number): ProgramCache | null {
  for (const key of [PROGRAM_KEY, ...LEGACY_KEYS])
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw) as ProgramCache;
      if (p.cycles?.some((c) => c.workouts?.some((w) => w.id === workoutId)))
        return p;
    } catch {
      /* try next */
    }
  return null;
}
function emitOutboxChange() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("gym:outbox-change"));
}
export function getOutbox(): OutboxOp[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(OUTBOX_KEY) ?? "[]",
    ) as Array<OutboxPayload & { operationId?: string }>;
    if (!Array.isArray(parsed)) return [];
    const ops = dedupeOperationsById(
      parsed.map(
        (op) =>
          ({
            ...op,
            operationId: op.operationId ?? crypto.randomUUID(),
          }) as OutboxOp,
      ),
    );
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
    return ops;
  } catch {
    return [];
  }
}
function setOutbox(ops: OutboxOp[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  emitOutboxChange();
}
export function pushOp(op: OutboxPayload | OutboxOp) {
  const item =
    "operationId" in op ? op : { ...op, operationId: crypto.randomUUID() };
  setOutbox(dedupeOperationsById([...getOutbox(), item as OutboxOp]));
}
function noInflightEdit() {
  if (flushing)
    throw new Error(
      "Идёт синхронизация. Дождитесь её завершения перед изменением очереди.",
    );
}
export function replaceQueuedLocalSet(
  sessionRef: number | string,
  workoutExerciseId: number,
  setNumber: number,
  patch: {
    weight: number | null;
    reps: number | null;
    rir: number | null;
    rpe: number | null;
  },
): boolean {
  noInflightEdit();
  let found = false;
  const next = getOutbox().map((op) => {
    if (
      op.kind === "set" &&
      op.sessionRef === sessionRef &&
      op.workoutExerciseId === workoutExerciseId &&
      op.setNumber === setNumber
    ) {
      found = true;
      return { ...op, ...patch };
    }
    return op;
  });
  if (found) setOutbox(next);
  return found;
}
export function removeQueuedLocalSet(
  sessionRef: number | string,
  workoutExerciseId: number,
  setNumber: number,
): boolean {
  noInflightEdit();
  const before = getOutbox();
  const next = before.filter(
    (op) =>
      !(
        op.kind === "set" &&
        op.sessionRef === sessionRef &&
        op.workoutExerciseId === workoutExerciseId &&
        op.setNumber === setNumber
      ),
  );
  if (next.length !== before.length) {
    setOutbox(next);
    return true;
  }
  return false;
}
function getLocalSessions(): Record<string, LocalSession> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function setLocalSessions(map: Record<string, LocalSession>) {
  localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(map));
}
export function getLocalSession(key: string): LocalSession | null {
  return getLocalSessions()[key] ?? null;
}
export function findLocalSession(workoutId: number): string | null {
  return (
    Object.entries(getLocalSessions()).find(
      ([, s]) => s.workoutId === workoutId && !s.finishedAt,
    )?.[0] ?? null
  );
}
function removeLocalSession(key: string) {
  const map = getLocalSessions();
  delete map[key];
  setLocalSessions(map);
  localStorage.removeItem(LOCAL_SETS_PREFIX + key);
}
export function createLocalSession(
  workoutId: number,
  readiness?: ReadinessInput,
  startChecks?: OfflineStartChecks,
): string {
  if (!readiness || !startChecks?.readinessReviewed)
    throw new Error("Нужна сегодняшняя проверка готовности.");
  const program = loadProgram();
  const cycle = program?.cycles.find((c) =>
    c.workouts.some((w) => w.id === workoutId),
  );
  const workout = cycle?.workouts.find((w) => w.id === workoutId);
  if (!program || !workout || !cycle)
    throw new Error(
      "Нет актуального офлайн-плана. Сначала откройте приложение с сетью.",
    );
  if (Date.now() - new Date(program.cachedAt).getTime() > 7 * 86400000)
    throw new Error(
      "Офлайн-план старше недели. Обновите его с сетью перед новым стартом.",
    );
  const meta = (workout.prescription ?? {}) as {
    isControl?: boolean;
    isRestDay?: boolean;
    isDeload?: boolean;
    isTaper?: boolean;
    warmupLevel?: string;
  };
  if (meta.isControl || startChecks.branch === "direct_1rm")
    throw new Error("Контроль и отдельная ветка 1ПМ недоступны офлайн.");
  const assessment = assessReadiness(readiness);
  const profile = safetyProfile(program.safetyProfile);
  const baseKg = program.baseKg ?? 115;
  const reasons = sessionStartReasons({
    profile,
    readiness: assessment.level,
    kind: workout.kind,
    isRestDay: meta.isRestDay === true,
    isControl: false,
    directBranch: false,
    finalTest: false,
    cycle: cycle.block === "h2" ? cycle.number : cycle.number + 9,
    spotterPresent: startChecks.spotterPresent === true,
    safetiesSet: startChecks.safetiesSet === true,
  });
  if (reasons.length) throw new Error(reasons.join(" "));
  const exercises = prepareExercises(workout.exercises, {
    baseKg,
    profile,
    readiness: assessment.level,
    branch: "triple",
    isControl: false,
    isDeload: meta.isDeload === true,
    isTaper: meta.isTaper === true,
    warmupKind: meta.warmupLevel,
  });
  const key = `local-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const snapshot = { profile, baseKg, exercises, workout, cycle };
  // Outbox and context are retained until explicit acknowledgements, including across an app upgrade.
  pushOp({
    kind: "start",
    localKey: key,
    workoutId,
    startedAt,
    readiness,
    startChecks,
    programVersion: program.programVersion,
    reportedBaseKg: baseKg,
  });
  const map = getLocalSessions();
  map[key] = {
    workoutId,
    startedAt,
    readiness,
    programVersion: program.programVersion,
    snapshot,
  };
  setLocalSessions(map);
  return key;
}
export function cancelLocalSession(key: string) {
  noInflightEdit();
  const session = getLocalSession(key);
  const current = getOutbox();
  if (session?.remoteId) {
    pushOp({ kind: "cancel", sessionRef: session.remoteId });
  }
  setOutbox(
    getOutbox().filter(
      (op) =>
        !(op.kind === "start" && op.localKey === key) &&
        !("sessionRef" in op && op.sessionRef === key),
    ),
  );
  removeLocalSession(key);
}
export function finishLocalSession(key: string) {
  const finishedAt = new Date().toISOString();
  pushOp({ kind: "finish", sessionRef: key, finishedAt });
  const map = getLocalSessions();
  if (map[key]) {
    map[key].finishedAt = finishedAt;
    setLocalSessions(map);
  }
}
export function finishLocalCardioSession(
  key: string,
  data: Omit<
    Extract<OutboxPayload, { kind: "cardioFinish" }>,
    "kind" | "sessionRef" | "finishedAt"
  >,
) {
  const finishedAt = new Date().toISOString();
  pushOp({ kind: "cardioFinish", sessionRef: key, finishedAt, ...data });
  const map = getLocalSessions();
  if (map[key]) {
    map[key].finishedAt = finishedAt;
    setLocalSessions(map);
  }
}
export function loadLocalSets(key: string): LocalSetRow[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SETS_PREFIX + key) ?? "[]");
  } catch {
    return [];
  }
}
export function saveLocalSets(key: string, sets: LocalSetRow[]) {
  localStorage.setItem(LOCAL_SETS_PREFIX + key, JSON.stringify(sets));
}

export async function flushOutbox(): Promise<boolean> {
  if (flushing) return false;
  flushing = true;
  try {
    for (let batch = 0; batch < 50; batch++) {
      const ops = getOutbox().slice(0, 200);
      if (!ops.length) return true;
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops }),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        ok?: boolean;
        results?: Array<{
          operationId: string;
          result: { sessionId?: number; setId?: number };
        }>;
      };
      if (!payload.ok || !Array.isArray(payload.results)) return false;
      const sent = new Map(ops.map((op) => [op.operationId, op]));
      const acknowledged = new Set<string>();
      const mappings: Array<{
        sessionRef: number | string;
        workoutExerciseId: number;
        setNumber: number;
        setId: number;
      }> = [];
      for (const item of payload.results) {
        const op = sent.get(item.operationId);
        if (!op) continue;
        acknowledged.add(item.operationId);
        if (op.kind === "start" && item.result.sessionId != null) {
          const local = getLocalSessions();
          if (local[op.localKey]) {
            local[op.localKey].remoteId = item.result.sessionId;
            setLocalSessions(local);
          }
        }
        if (op.kind === "set" && item.result.setId != null) {
          mappings.push({
            sessionRef: op.sessionRef,
            workoutExerciseId: op.workoutExerciseId,
            setNumber: op.setNumber,
            setId: item.result.setId,
          });
          if (typeof op.sessionRef === "string")
            saveLocalSets(
              op.sessionRef,
              loadLocalSets(op.sessionRef).map((s) =>
                s.workoutExerciseId === op.workoutExerciseId &&
                s.setNumber === op.setNumber
                  ? { ...s, id: item.result.setId! }
                  : s,
              ),
            );
        }
        if (
          (op.kind === "finish" || op.kind === "cardioFinish") &&
          typeof op.sessionRef === "string"
        )
          removeLocalSession(op.sessionRef);
      }
      if (!acknowledged.size) return false;
      // Never slice by queue position: another operation may have been appended during fetch.
      setOutbox(getOutbox().filter((op) => !acknowledged.has(op.operationId)));
      if (typeof window !== "undefined")
        window.dispatchEvent(
          new CustomEvent("gym:synced", { detail: { mappings } }),
        );
      if (acknowledged.size < ops.length) return false;
    }
    return getOutbox().length === 0;
  } catch {
    return false;
  } finally {
    flushing = false;
  }
}
