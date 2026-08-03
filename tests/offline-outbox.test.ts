import assert from "node:assert/strict";
import test from "node:test";
import {
  cacheProgram,
  cancelLocalSession,
  createLocalSession,
  finishLocalSession,
  getOutbox,
  loadProgram,
  pushOp,
  removeQueuedLocalSet,
  replaceQueuedLocalSet,
} from "../lib/offline.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", {
  value: { dispatchEvent: () => true },
  configurable: true,
});


test("versioned program cache rejects stale data", () => {
  storage.clear();
  cacheProgram({
    programVersion: "h2-v9-3.0",
    cycles: [],
    lastSetsByName: {},
  });
  assert.equal(loadProgram()?.programVersion, "h2-v9-3.0");
  storage.setItem(
    "gym:program:h2-v9-3.0",
    JSON.stringify({ programVersion: "h2-v9-2.0", cachedAt: new Date().toISOString() }),
  );
  assert.equal(loadProgram(), null);
});


test("кэш прошлых редакций вычищается, а не просто игнорируется", () => {
  // Редакция 2.0 объявляла кэш 1.0 устаревшим, но фактически его не удаляла.
  storage.clear();
  storage.setItem("gym:program:h2-v9-1.0", JSON.stringify({ programVersion: "h2-v9-1.0" }));
  storage.setItem("gym:program:h2-v9-2.0", JSON.stringify({ programVersion: "h2-v9-2.0" }));
  loadProgram();
  assert.equal(storage.getItem("gym:program:h2-v9-1.0"), null);
  assert.equal(storage.getItem("gym:program:h2-v9-2.0"), null);
});


test("offline set edit rewrites the queued set instead of losing the change", () => {
  storage.clear();
  const key = createLocalSession(10, { sleepMinutes: 420, sleepQuality: 4 });
  pushOp({
    kind: "set",
    sessionRef: key,
    workoutExerciseId: 20,
    setNumber: 1,
    weight: 75,
    reps: 8,
    rir: 3,
    rpe: 7,
    velocity: "normal",
    stickingPoint: null,
  });
  assert.equal(
    replaceQueuedLocalSet(key, 20, 1, {
      weight: 72.5,
      reps: 8,
      rir: 4,
      rpe: 6.5,
    }),
    true,
  );
  const set = getOutbox().find((operation) => operation.kind === "set");
  assert.ok(set && set.kind === "set");
  assert.equal(set.weight, 72.5);
  assert.equal(set.rpe, 6.5);
  finishLocalSession(key);
  assert.deepEqual(
    getOutbox().map((operation) => operation.kind),
    ["start", "set", "finish"],
  );
});


test("deleting a local set removes the queued insertion and cancellation clears the session", () => {
  storage.clear();
  const key = createLocalSession(11, { poorSleep: true });
  pushOp({
    kind: "set",
    sessionRef: key,
    workoutExerciseId: 21,
    setNumber: 1,
    weight: 70,
    reps: 5,
    rir: 3,
    rpe: 7,
    velocity: "normal",
    stickingPoint: null,
  });
  assert.equal(removeQueuedLocalSet(key, 21, 1), true);
  assert.deepEqual(getOutbox().map((operation) => operation.kind), ["start"]);
  cancelLocalSession(key);
  assert.deepEqual(getOutbox(), []);
});
