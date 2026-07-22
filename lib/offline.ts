// Клиентский офлайн-слой: кэш программы, очередь операций (outbox), локальные сессии
"use client";

import type { LoggedSetLite } from "./recommend.ts";
import type { ReadinessInput } from "./readiness.ts";
import { dedupeOperationsById } from "./offline-dedup.ts";

const PROGRAM_KEY = "gym:program:h2-v9-1.0";
const ACTIVE_PROGRAM_VERSION = "h2-v9-1.0";
const OUTBOX_KEY = "gym:outbox";
const LOCAL_SESSIONS_KEY = "gym:local-sessions";
const LOCAL_SETS_PREFIX = "gym:local-sets:";

// ---------- Типы ----------

export type CachedExercise = {
  id: number;
  workoutId: number;
  name: string;
  weightText: string | null;
  targetReps: string | null;
  targetSets: string | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRpeMin?: number | null;
  targetRpeMax?: number | null;
  role?: string;
  isOptional?: boolean;
  condition?: string | null;
  comment: string | null;
  restSeconds: number | null;
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
};

export type OutboxPayload =
  | {
      kind: "start";
      localKey: string;
      workoutId: number;
      startedAt: string;
      readiness?: ReadinessInput;
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
      velocity: "fast" | "normal" | "slow";
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
      cardioRpe: number;
      cardioTalkTest: "full_sentences" | "short_phrases" | "difficult";
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

// ---------- Кэш программы ----------

export function cacheProgram(data: Omit<ProgramCache, "cachedAt">) {
  try {
    localStorage.setItem(
      PROGRAM_KEY,
      JSON.stringify({ ...data, cachedAt: new Date().toISOString() }),
    );
  } catch {
    // localStorage недоступен/переполнен — офлайн-режим просто не сработает
  }
}

export function loadProgram(): ProgramCache | null {
  try {
    const raw = localStorage.getItem(PROGRAM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProgramCache;
    if (parsed.programVersion !== ACTIVE_PROGRAM_VERSION) {
      localStorage.removeItem(PROGRAM_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ---------- Очередь операций ----------

function emitOutboxChange() {
  window.dispatchEvent(new CustomEvent("gym:outbox-change"));
}

export function getOutbox(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    // Однократная миграция очереди этапа 2: уже накопленные операции тоже
    // получают постоянный UUID и после этого не меняют его при повторах.
    const parsed = JSON.parse(raw) as Array<
      OutboxPayload & { operationId?: string }
    >;
    let changed = false;
    const ops = parsed.map((op) => {
      if (op.operationId) return op as OutboxOp;
      changed = true;
      return { ...op, operationId: crypto.randomUUID() } as OutboxOp;
    });
    const unique = dedupeOperationsById(ops);
    if (changed || unique.length !== ops.length) {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(unique));
    }
    return unique;
  } catch {
    return [];
  }
}

function setOutbox(ops: OutboxOp[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  emitOutboxChange();
}

export function pushOp(op: OutboxPayload | OutboxOp) {
  const operation =
    "operationId" in op ? op : { ...op, operationId: crypto.randomUUID() };
  setOutbox(dedupeOperationsById([...getOutbox(), operation as OutboxOp]));
}

export function replaceQueuedLocalSet(
  sessionRef: number | string,
  workoutExerciseId: number,
  setNumber: number,
  patch: { weight: number | null; reps: number | null; rir: number | null; rpe: number | null },
): boolean {
  let changed = false;
  const next = getOutbox().map((op) => {
    if (
      op.kind === "set" &&
      op.sessionRef === sessionRef &&
      op.workoutExerciseId === workoutExerciseId &&
      op.setNumber === setNumber
    ) {
      changed = true;
      return { ...op, ...patch };
    }
    return op;
  });
  if (changed) setOutbox(next);
  return changed;
}

export function removeQueuedLocalSet(
  sessionRef: number | string,
  workoutExerciseId: number,
  setNumber: number,
): boolean {
  const current = getOutbox();
  const next = current.filter(
    (op) =>
      !(
        op.kind === "set" &&
        op.sessionRef === sessionRef &&
        op.workoutExerciseId === workoutExerciseId &&
        op.setNumber === setNumber
      ),
  );
  if (next.length !== current.length) {
    setOutbox(next);
    return true;
  }
  return false;
}

/** Отправляет очередь на сервер. Возвращает true, если всё ушло. */
export async function flushOutbox(): Promise<boolean> {
  const ops = getOutbox();
  if (ops.length === 0) return true;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    });
    if (!res.ok) return false;
    // удаляем только то, что отправили (за время запроса могли добавиться новые операции)
    const remaining = getOutbox().slice(ops.length);
    setOutbox(remaining);
    // локальные сессии, ушедшие на сервер, больше не нужны
    for (const op of ops) {
      if (op.kind === "start") removeLocalSession(op.localKey);
    }
    return true;
  } catch {
    return false;
  }
}

// ---------- Локальные (офлайн) сессии ----------

type LocalSessionMap = Record<
  string,
  { workoutId: number; startedAt: string; readiness?: ReadinessInput }
>;

function getLocalSessions(): LocalSessionMap {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as LocalSessionMap) : {};
  } catch {
    return {};
  }
}

function setLocalSessions(map: LocalSessionMap) {
  localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(map));
}

/** Активная локальная сессия для тренировки, если есть */
export function findLocalSession(workoutId: number): string | null {
  const map = getLocalSessions();
  for (const [key, v] of Object.entries(map)) {
    if (v.workoutId === workoutId) return key;
  }
  return null;
}

export function getLocalSession(localKey: string) {
  return getLocalSessions()[localKey] ?? null;
}

export function createLocalSession(
  workoutId: number,
  readiness?: ReadinessInput,
): string {
  const key = `local-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const map = getLocalSessions();
  map[key] = { workoutId, startedAt, readiness };
  setLocalSessions(map);
  pushOp({ kind: "start", localKey: key, workoutId, startedAt, readiness });
  return key;
}

function removeLocalSession(localKey: string) {
  const map = getLocalSessions();
  delete map[localKey];
  setLocalSessions(map);
  localStorage.removeItem(LOCAL_SETS_PREFIX + localKey);
}

/** Полная отмена локальной сессии: убирает её операции из очереди */
export function cancelLocalSession(localKey: string) {
  const ops = getOutbox().filter(
    (op) =>
      !(op.kind === "start" && op.localKey === localKey) &&
      !("sessionRef" in op && op.sessionRef === localKey),
  );
  setOutbox(ops);
  removeLocalSession(localKey);
}

/** Локальная сессия завершена — подходы и финиш уже в очереди */
export function finishLocalSession(localKey: string) {
  pushOp({
    kind: "finish",
    sessionRef: localKey,
    finishedAt: new Date().toISOString(),
  });
  removeLocalSession(localKey);
}

export function finishLocalCardioSession(
  localKey: string,
  data: Omit<
    Extract<OutboxPayload, { kind: "cardioFinish" }>,
    "kind" | "sessionRef" | "finishedAt"
  >,
) {
  pushOp({
    kind: "cardioFinish",
    sessionRef: localKey,
    finishedAt: new Date().toISOString(),
    ...data,
  });
  removeLocalSession(localKey);
}

// ---------- Подходы локальной сессии ----------

export function loadLocalSets(localKey: string): LocalSetRow[] {
  try {
    const raw = localStorage.getItem(LOCAL_SETS_PREFIX + localKey);
    return raw ? (JSON.parse(raw) as LocalSetRow[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalSets(localKey: string, sets: LocalSetRow[]) {
  localStorage.setItem(LOCAL_SETS_PREFIX + localKey, JSON.stringify(sets));
}
