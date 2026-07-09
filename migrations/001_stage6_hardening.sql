-- GymKeeper versioned migration: security, integrity and audit
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS velocity text;
ALTER TABLE logged_sets ADD COLUMN IF NOT EXISTS sticking_point text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS tempo text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_speed text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_resistance text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sleep_minutes integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sleep_quality integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS morning_pulse_delta integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shoulder_pain integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS back_pain integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS energy integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS readiness_level text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_rpe integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_talk_test text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_symptoms text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_overheating integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cardio_feeling integer;

CREATE TABLE IF NOT EXISTS tm_recalc_events (
  session_id integer PRIMARY KEY,
  target_macro integer NOT NULL,
  old_tm numeric,
  new_tm numeric NOT NULL,
  amrap_weight numeric NOT NULL,
  amrap_reps integer NOT NULL,
  e1rm numeric NOT NULL,
  result_fingerprint text NOT NULL DEFAULT '',
  updated_exercises integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tm_recalc_events ADD COLUMN IF NOT EXISTS result_fingerprint text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS tm_change_history (
  id serial PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('amrap','manual','undo')),
  session_id integer,
  target_macro integer NOT NULL,
  old_tm numeric,
  new_tm numeric NOT NULL,
  amrap_weight numeric,
  amrap_reps integer,
  e1rm numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_ops (
  operation_id text PRIMARY KEY,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active workout in the entire personal workspace.
WITH active AS (
 SELECT id, row_number() OVER (ORDER BY started_at, id) AS n
 FROM sessions WHERE status='active'
)
UPDATE sessions SET status='cancelled', finished_at=COALESCE(finished_at,now())
FROM active WHERE sessions.id=active.id AND active.n>1;
DROP INDEX IF EXISTS sessions_one_active_per_workout;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_global
  ON sessions ((status)) WHERE status='active';

CREATE INDEX IF NOT EXISTS logged_sets_session_idx ON logged_sets(session_id);
CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises(workout_id);
