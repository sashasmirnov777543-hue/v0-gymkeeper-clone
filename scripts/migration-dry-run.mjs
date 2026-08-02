import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = path.join(root, "migrations");
const names = (await fs.readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
const sqlByName = new Map(
  await Promise.all(
    names.map(async (name) => [name, await fs.readFile(path.join(migrationDir, name), "utf8")]),
  ),
);
const BACKUP_TABLES = [
  "cycles",
  "workouts",
  "workout_exercises",
  "sessions",
  "logged_sets",
  "app_settings",
  "program_state",
  "recovery_insertions",
  "rhr_measurements",
  "rmref_review_events",
  "session_gate_decisions",
  "coach_messages",
  "coach_proposals",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function scalar(db, sql, key) {
  const result = await db.query(sql);
  return Number(result.rows[0]?.[key] ?? 0);
}

async function apply(db, selected) {
  await db.exec("BEGIN");
  try {
    await db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of selected) {
      await db.exec(sqlByName.get(name));
      await db.query(
        "INSERT INTO schema_migrations(name) VALUES($1) ON CONFLICT(name) DO NOTHING",
        [name],
      );
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => {});
    throw new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function verifyCanonicalCounts(db) {
  const cycles = await scalar(
    db,
    "SELECT count(*)::int AS n FROM cycles WHERE program_version='h2-v9-1.0'",
    "n",
  );
  const workouts = await scalar(
    db,
    `SELECT count(*)::int AS n FROM workouts w
     JOIN cycles c ON c.id=w.cycle_id WHERE c.program_version='h2-v9-1.0'`,
    "n",
  );
  const exercises = await scalar(
    db,
    `SELECT count(*)::int AS n FROM workout_exercises e
     JOIN workouts w ON w.id=e.workout_id
     JOIN cycles c ON c.id=w.cycle_id WHERE c.program_version='h2-v9-1.0'`,
    "n",
  );
  assert(cycles === 22, `Expected 22 canonical cycles, got ${cycles}`);
  assert(workouts === 88, `Expected 88 canonical workouts, got ${workouts}`);
  assert(exercises === 294, `Expected 294 canonical exercise rows, got ${exercises}`);
  const state = await db.query(
    "SELECT program_version, current_program_day, rmref_kg::float8 AS rmref FROM program_state WHERE profile_key='primary'",
  );
  assert(state.rows[0]?.program_version === "h2-v9-2.0", "program_state version mismatch");
  assert(Number(state.rows[0]?.current_program_day) === 1, "program_state day mismatch");
  assert(Number(state.rows[0]?.rmref) === 115, "program_state RMref mismatch");
  return { cycles, workouts, exercises };
}

async function freshDatabaseRun() {
  const db = new PGlite();
  await apply(db, names);
  const first = await verifyCanonicalCounts(db);
  await db.exec(sqlByName.get("009_h2_v9_v1_schema.sql"));
  await db.exec(sqlByName.get("010_seed_h2_v9_v1.sql"));
  const second = await verifyCanonicalCounts(db);
  assert(JSON.stringify(first) === JSON.stringify(second), "Direct reapply changed canonical counts");
  await db.close();
  return first;
}

async function populatedLegacyRun() {
  const db = new PGlite();
  const legacyMigrations = names.filter((name) => name < "009_h2_v9_v1_schema.sql");
  await apply(db, legacyMigrations);
  const legacyCycle = await db.query(
    `INSERT INTO cycles(number,name,macrocycle,notes,sort_order,block)
     VALUES(99,'Legacy retained cycle',1,'fixture',999,'v9') RETURNING id`,
  );
  const legacyWorkout = await db.query(
    `INSERT INTO workouts(cycle_id,label,title,notes,sort_order,kind)
     VALUES($1,'B2','Legacy retained workout','fixture',1,'strength') RETURNING id`,
    [legacyCycle.rows[0].id],
  );
  const legacyExercise = await db.query(
    `INSERT INTO workout_exercises(workout_id,sort_order,name,target_reps,target_sets)
     VALUES($1,1,'Legacy retained exercise','5','1') RETURNING id`,
    [legacyWorkout.rows[0].id],
  );
  const legacySession = await db.query(
    `INSERT INTO sessions(workout_id,status,finished_at) VALUES($1,'completed',now()) RETURNING id`,
    [legacyWorkout.rows[0].id],
  );
  await db.query(
    `INSERT INTO logged_sets(session_id,workout_exercise_id,set_number,weight,reps,rir)
     VALUES($1,$2,1,50,5,3)`,
    [legacySession.rows[0].id, legacyExercise.rows[0].id],
  );
  await apply(db, names.filter((name) => name >= "009_h2_v9_v1_schema.sql"));
  await verifyCanonicalCounts(db);
  const retained = await db.query(
    `SELECT c.program_version, w.title, e.name, s.status, l.weight::float8 AS weight
     FROM logged_sets l
     JOIN sessions s ON s.id=l.session_id
     JOIN workout_exercises e ON e.id=l.workout_exercise_id
     JOIN workouts w ON w.id=s.workout_id
     JOIN cycles c ON c.id=w.cycle_id
     WHERE s.id=$1`,
    [legacySession.rows[0].id],
  );
  assert(retained.rows.length === 1, "Legacy join was lost");
  assert(retained.rows[0].program_version === "legacy", "Legacy cycle was not marked legacy");
  assert(retained.rows[0].title === "Legacy retained workout", "Legacy workout changed");
  assert(Number(retained.rows[0].weight) === 50, "Legacy set changed");
  await db.close();
}

async function backupRoundTripRun() {
  const db = new PGlite();
  await apply(db, names);
  const ids = await db.query(
    `SELECT w.id AS workout_id, e.id AS exercise_id
     FROM workouts w JOIN workout_exercises e ON e.workout_id=w.id
     WHERE w.program_key='h2-1-b2' ORDER BY e.sort_order LIMIT 1`,
  );
  const session = await db.query(
    `INSERT INTO sessions(workout_id,status,finished_at,program_version,readiness_level)
     VALUES($1,'completed',now(),'h2-v9-1.0','green') RETURNING id`,
    [ids.rows[0].workout_id],
  );
  await db.query(
    `INSERT INTO logged_sets(session_id,workout_exercise_id,set_number,weight,reps,rir,rpe)
     VALUES($1,$2,1,75,8,3,7)`,
    [session.rows[0].id, ids.rows[0].exercise_id],
  );
  await db.query(
    "INSERT INTO rhr_measurements(measured_on,bpm,comparable) VALUES('2026-07-21',60,true)",
  );
  await db.query(
    "INSERT INTO sync_ops(operation_id,result) VALUES('00000000-0000-4000-8000-000000000001','{}'::jsonb)",
  );

  const backup = {};
  for (const table of BACKUP_TABLES) {
    backup[table] = (await db.query(`SELECT * FROM ${table}`)).rows;
  }
  for (const table of [...BACKUP_TABLES].reverse()) await db.exec(`DELETE FROM ${table}`);
  await db.exec("DELETE FROM sync_ops");
  for (const table of BACKUP_TABLES) {
    for (const row of backup[table]) {
      const keys = Object.keys(row);
      if (!keys.length) continue;
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(",");
      await db.query(
        `INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders})`,
        keys.map((key) => row[key]),
      );
    }
  }
  const restored = await scalar(
    db,
    `SELECT count(*)::int AS n FROM logged_sets l
     JOIN sessions s ON s.id=l.session_id
     JOIN workout_exercises e ON e.id=l.workout_exercise_id`,
    "n",
  );
  assert(restored === 1, `Backup round trip restored ${restored} logged sets`);
  assert(
    (await scalar(db, "SELECT count(*)::int AS n FROM rhr_measurements", "n")) === 1,
    "RHR was not restored",
  );
  assert(
    (await scalar(db, "SELECT count(*)::int AS n FROM sync_ops", "n")) === 0,
    "sync_ops must be cleared during restore",
  );
  await verifyCanonicalCounts(db);
  await db.close();
}

const fresh = await freshDatabaseRun();
await populatedLegacyRun();
await backupRoundTripRun();
console.log(
  `Migration dry run passed: ${fresh.cycles} cycles, ${fresh.workouts} workouts, ${fresh.exercises} exercise rows; idempotency, legacy joins and backup round trip verified.`,
);
