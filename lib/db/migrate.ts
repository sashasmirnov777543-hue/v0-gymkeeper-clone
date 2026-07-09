/** Schema changes are applied by `pnpm db:migrate` from versioned SQL files. */
export async function ensureSchema(): Promise<void> {
  // Kept as a compatibility boundary for existing call sites; intentionally no runtime DDL.
}
