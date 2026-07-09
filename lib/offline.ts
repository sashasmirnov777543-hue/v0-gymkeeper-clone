// Клиентский офлайн-слой: кэш программы, очередь операций (outbox), локальные сессии
"use client";

import type { LoggedSetLite } from "@/lib/recommend";

const PROGRAM_KEY = "gym:program";
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
  cycles: CachedCycle[];
  lastSetsByName: Record<string, LoggedSetLite[]>;
};

export type OutboxPayload =
  | { kind: "start"; localKey: string; workoutId: number; startedAt: string }
  | {
      kind: "set";
      sessionRef: number | string;
      workoutExerciseId: number;
      setNumber: number;
      weight: number | null;
      reps: number | null;
      rir: number | null;
    }
  | {
      kind: "finish";
      sessionRef: number | string;
      finishedAt: string;
      proposedTm?: number;
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
    return raw ? (JSON.parse(raw) as ProgramCache) : null;
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
    if (changed) localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
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
  const operation =
    "operationId" in op ? op : { ...op, operationId: crypto.randomUUID() };
  setOutbox([...getOutbox(), operation as OutboxOp]);
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

type LocalSessionMap = Record<string, { workoutId: number; startedAt: string }>;

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

export function createLocalSession(workoutId: number): string {
  const key = `local-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const map = getLocalSessions();
  map[key] = { workoutId, startedAt };
  setLocalSessions(map);
  pushOp({ kind: "start", localKey: key, workoutId, startedAt });
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
export function finishLocalSession(localKey: string, proposedTm?: number) {
  pushOp({
    kind: "finish",
    sessionRef: localKey,
    finishedAt: new Date().toISOString(),
    proposedTm,
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
