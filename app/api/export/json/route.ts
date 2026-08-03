import { pool } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import { requireAuth } from "@/lib/require-auth";
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION } from "@/lib/backup";

export const dynamic = "force-dynamic";
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const existing = new Set(
      (
        await client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE'`,
        )
      ).rows.map((row) => row.table_name),
    );
    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      if (!existing.has(table)) {
        tables[table] = [];
        continue;
      }
      tables[table] = (
        await client.query(`SELECT * FROM ${quote(table)}`)
      ).rows;
    }
    await client.query("COMMIT");
    const exportedAt = new Date().toISOString();
    return new Response(
      JSON.stringify(
        {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          programVersion: "h2-v9-3.0",
          exportedAt,
          tables,
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="gymkeeper-backup-${exportedAt.slice(0, 10)}.json"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
