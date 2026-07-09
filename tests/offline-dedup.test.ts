import assert from "node:assert/strict";
import test from "node:test";
import { dedupeOperationsById } from "../lib/offline-dedup.ts";

test("офлайн-очередь оставляет одну операцию на operationId", () => {
  const first = { operationId: "same", kind: "set", value: 1 };
  const duplicate = { operationId: "same", kind: "set", value: 2 };
  const other = { operationId: "other", kind: "finish", value: 3 };
  assert.deepEqual(dedupeOperationsById([first, duplicate, other]), [first, other]);
});
