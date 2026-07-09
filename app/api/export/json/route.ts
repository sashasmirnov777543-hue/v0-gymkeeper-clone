import { pool } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Полная JSON-копия всех пользовательских таблиц схемы public. */
export async function GET() {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tableResult = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );

    const tables: Record<string, unknown[]> = {};
    for (const { table_name: tableName } of tableResult.rows) {
      const rows = await client.query(
        `SELECT * FROM ${quoteIdentifier(tableName)}`,
      );
      tables[tableName] = rows.rows;
    }
    await client.query("COMMIT");

    const exportedAt = new Date().toISOString();
    const json = JSON.stringify(
      { format: "gymkeeper-backup", version: 1, exportedAt, tables },
      null,
      2,
    );
    return new Response(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="gymkeeper-backup-${exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
