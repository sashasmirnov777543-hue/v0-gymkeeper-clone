export type OperationWithId = { operationId: string };

/** Сохраняет первую операцию с UUID и отбрасывает повторы того же UUID. */
export function dedupeOperationsById<T extends OperationWithId>(ops: T[]): T[] {
  const seen = new Set<string>();
  return ops.filter((op) => {
    if (seen.has(op.operationId)) return false;
    seen.add(op.operationId);
    return true;
  });
}
