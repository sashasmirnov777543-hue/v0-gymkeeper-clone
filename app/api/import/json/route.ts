import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION } from "@/lib/backup";

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 20_000_000) {
    return NextResponse.json({ error: "Файл больше 20 МБ" }, { status: 413 });
  }
  let backup: {
    format?: string;
    version?: number;
    programVersion?: string;
    tables?: Record<string, unknown[]>;
  };
  try {
    backup = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (
    backup.format !== BACKUP_FORMAT ||
    backup.version !== BACKUP_VERSION ||
    !backup.tables
  ) {
    return NextResponse.json(
      { error: `Нужна резервная копия GymKeeper v${BACKUP_VERSION}` },
      { status: 400 },
    );
  }
  const allowed = new Set<string>(BACKUP_TABLES);
  for (const name of Object.keys(backup.tables)) {
    if (!allowed.has(name)) {
      return NextResponse.json(
        { error: `Недопустимая таблица: ${name}` },
        { status: 400 },
      );
    }
  }
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(backup.tables[table])) {
      return NextResponse.json(
        { error: `В копии отсутствует таблица ${table}` },
        { status: 400 },
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    for (const name of [...BACKUP_TABLES].reverse()) {
      await client.query(`DELETE FROM ${quote(name)}`);
    }
    await client.query("DELETE FROM sync_ops");

    for (const name of BACKUP_TABLES) {
      const rows = backup.tables[name] ?? [];
      const columns = (
        await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
          [name],
        )
      ).rows.map((row) => row.column_name);
      for (const raw of rows) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error(`Некорректная строка ${name}`);
        }
        const row = raw as Record<string, unknown>;
        const keys = Object.keys(row);
        if (keys.some((key) => !columns.includes(key))) {
          throw new Error(`Неизвестная колонка в ${name}`);
        }
        if (!keys.length) continue;
        await client.query(
          `INSERT INTO ${quote(name)} (${keys.map(quote).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")})`,
          keys.map((key) => row[key]),
        );
      }
      const sequence = columns.includes("id")
        ? await client.query<{ seq: string | null }>(
            "SELECT pg_get_serial_sequence($1,'id') AS seq",
            [name],
          )
        : { rows: [] };
      if (sequence.rows[0]?.seq) {
        await client.query(
          `SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${quote(name)}), 1), (SELECT MAX(id) IS NOT NULL FROM ${quote(name)}))`,
          [sequence.rows[0].seq],
        );
      }
    }

    const orphanSessions = await client.query(
      `SELECT s.id FROM sessions s LEFT JOIN workouts w ON w.id=s.workout_id
       WHERE w.id IS NULL LIMIT 1`,
    );
    const orphanSets = await client.query(
      `SELECT l.id FROM logged_sets l
       LEFT JOIN sessions s ON s.id=l.session_id
       LEFT JOIN workout_exercises e ON e.id=l.workout_exercise_id
       WHERE s.id IS NULL OR e.id IS NULL LIMIT 1`,
    );
    if (orphanSessions.rowCount || orphanSets.rowCount) {
      throw new Error("Копия содержит нарушенные связи тренировок");
    }

    const seed = await readFile(
      join(process.cwd(), "migrations", "016_seed_h2_v9_v4.sql"),
      "utf8",
    );
    await client.query(seed);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, version: BACKUP_VERSION });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ошибка восстановления",
      },
      { status: 400 },
    );
  } finally {
    client.release();
  }
}
