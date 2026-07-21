import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BACKUP_TABLES, BACKUP_VERSION } from "../lib/backup.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");


test("fresh database has a baseline before additive migrations", () => {
  const sql = read("migrations/000_base_schema.sql");
  for (const table of ["cycles", "workouts", "workout_exercises", "sessions", "logged_sets", "app_settings"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});


test("v1 schema migration is additive and preserves user history", () => {
  const sql = read("migrations/009_h2_v9_v1_schema.sql");
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS program_state/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rhr_measurements/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS coach_proposals/);
  assert.match(sql, /ON CONFLICT \(profile_key\) DO NOTHING/);
});


test("canonical seed contains 22 cycles, 88 workouts and branch exercises", () => {
  const sql = read("migrations/010_seed_h2_v9_v1.sql");
  assert.equal((sql.match(/INSERT INTO cycles /g) ?? []).length, 22);
  assert.equal((sql.match(/INSERT INTO workouts /g) ?? []).length, 88);
  assert.equal((sql.match(/INSERT INTO workout_exercises /g) ?? []).length, 294);
  assert.match(sql, /branch-triple/);
  assert.match(sql, /branch-direct_1rm/);
  assert.doesNotMatch(sql, /Face pull Двойная|abочий|ace pull \+ ротация 2/);
  assert.doesNotMatch(sql, /UPDATE cycles SET block = 'archive_/);
});


test("migration helper contains no committed database credential", () => {
  const script = read("run-migration.bat");
  assert.match(script, /DATABASE_URL is not set/);
  assert.doesNotMatch(script, /postgresql:\/\//);
  assert.doesNotMatch(script, /npg_[A-Za-z0-9]+/);
});


test("backup v2 uses one explicit round-trip table contract", () => {
  assert.equal(BACKUP_VERSION, 2);
  assert.deepEqual(BACKUP_TABLES, [
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
  ]);
  assert.ok(!BACKUP_TABLES.includes("sync_ops" as never));
  assert.ok(!BACKUP_TABLES.includes("push_subscriptions" as never));
});
