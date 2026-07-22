export const BACKUP_FORMAT = "gymkeeper-backup";
export const BACKUP_VERSION = 2;
export const BACKUP_TABLES = [
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
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
