-- 009: H2→V9 v1 data model, readiness journal, RMref lifecycle and coach audit.
-- Additive and idempotent: no session, set or setting is deleted or overwritten.

ALTER TABLE cycles ADD COLUMN IF NOT EXISTS program_version text NOT NULL DEFAULT 'legacy';
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS program_key text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS day_offset integer;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS checkpoint jsonb;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS rules jsonb;

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS program_key text;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS day_in_cycle integer;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS warmup_level text;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS prescription jsonb;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS branches jsonb;

ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS program_key text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'accessory';
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS pct_min numeric;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS pct_max numeric;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS example_kg_min numeric;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS example_kg_max numeric;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS target_rpe_min numeric;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS target_rpe_max numeric;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS condition_code text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS exclude_from_tonnage boolean NOT NULL DEFAULT false;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS prescription jsonb;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS program_version text NOT NULL DEFAULT 'legacy';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS planned_for date;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS readiness_input jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS readiness_reasons jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS adaptation_plan jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS red_flags jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS test_branch text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_modality text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_warmup_minutes integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_main_minutes integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_cooldown_minutes integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pain_location text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS symptoms jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS unusual_sedation boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS medication_changed boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hydration_issue boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS illness boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS safety_stopped boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS rpe numeric;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS is_warmup boolean NOT NULL DEFAULT false;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS pause_quality text;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS touch_point text;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS trajectory_quality text;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS technique_signs jsonb;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS pain_score integer;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS symptoms jsonb;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS video_url text;

CREATE TABLE IF NOT EXISTS program_state (
  profile_key text PRIMARY KEY DEFAULT 'primary',
  program_version text NOT NULL DEFAULT 'h2-v9-1.0',
  start_date date,
  current_program_day integer NOT NULL DEFAULT 1,
  rmref_kg numeric NOT NULL DEFAULT 115,
  test_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_insertions (
  id serial PRIMARY KEY,
  after_program_day integer NOT NULL,
  days integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rhr_measurements (
  id serial PRIMARY KEY,
  measured_on date NOT NULL,
  bpm integer NOT NULL,
  repeated_bpm integer,
  comparable boolean NOT NULL DEFAULT true,
  poor_wellbeing boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rmref_review_events (
  id serial PRIMARY KEY,
  checkpoint text NOT NULL,
  previous_rmref_kg numeric NOT NULL,
  proposed_rmref_kg numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  evidence jsonb NOT NULL,
  reasons jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS session_gate_decisions (
  id serial PRIMARY KEY,
  session_id integer NOT NULL,
  gate text NOT NULL,
  allowed boolean NOT NULL,
  inputs jsonb NOT NULL,
  reasons jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_messages (
  id serial PRIMARY KEY,
  role text NOT NULL,
  content text NOT NULL,
  model text,
  request_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_proposals (
  id serial PRIMARY KEY,
  message_id integer,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  target text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  patch jsonb NOT NULL,
  safety jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  decided_at timestamptz,
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS push_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS push_schedules (
  endpoint text PRIMARY KEY,
  subscription text NOT NULL,
  end_at bigint NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  client_ts bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS push_log (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  detail text NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS cycles_program_key_unique
  ON cycles(program_version, program_key) WHERE program_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workouts_program_key_unique
  ON workouts(program_key) WHERE program_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workout_exercises_program_key_unique
  ON workout_exercises(program_key) WHERE program_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recovery_insertions_day_unique
  ON recovery_insertions(after_program_day);
CREATE UNIQUE INDEX IF NOT EXISTS rhr_measurements_day_unique
  ON rhr_measurements(measured_on);
CREATE INDEX IF NOT EXISTS session_gate_decisions_session_idx
  ON session_gate_decisions(session_id, gate, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS coach_messages_request_id_unique
  ON coach_messages(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_messages_created_idx ON coach_messages(created_at);
CREATE INDEX IF NOT EXISTS coach_proposals_status_idx ON coach_proposals(status, created_at);

INSERT INTO program_state(profile_key, program_version, current_program_day, rmref_kg)
VALUES ('primary', 'h2-v9-1.0', 1, 115)
ON CONFLICT (profile_key) DO NOTHING;

INSERT INTO app_settings(key, value) VALUES
  ('active_program_version', 'h2-v9-1.0'),
  ('rmref_kg', '115')
ON CONFLICT (key) DO NOTHING;
