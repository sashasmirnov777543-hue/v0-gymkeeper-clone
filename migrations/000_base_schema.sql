-- 000: Reproducible baseline for a fresh database.
-- Existing installations are unaffected because every object is created IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS cycles (
  id serial PRIMARY KEY,
  number integer NOT NULL,
  name text NOT NULL,
  macrocycle integer NOT NULL DEFAULT 1,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  block text NOT NULL DEFAULT 'v9'
);

CREATE TABLE IF NOT EXISTS workouts (
  id serial PRIMARY KEY,
  cycle_id integer NOT NULL,
  label text NOT NULL,
  title text NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'strength',
  cardio_zone text,
  cardio_minutes text
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id serial PRIMARY KEY,
  workout_id integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  weight_text text,
  pct_of_tm numeric,
  target_reps text,
  target_sets text,
  target_rir_min integer,
  target_rir_max integer,
  tempo text,
  comment text,
  rest_seconds integer
);

CREATE TABLE IF NOT EXISTS sessions (
  id serial PRIMARY KEY,
  workout_id integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  notes text,
  duration_seconds integer,
  avg_hr integer,
  cardio_speed text,
  cardio_resistance text,
  cardio_rpe integer,
  cardio_talk_test text,
  cardio_symptoms text,
  cardio_overheating integer,
  cardio_feeling integer,
  sleep_minutes integer,
  sleep_quality integer,
  morning_pulse_delta integer,
  shoulder_pain integer,
  back_pain integer,
  energy integer,
  readiness_level text
);

CREATE TABLE IF NOT EXISTS logged_sets (
  id serial PRIMARY KEY,
  session_id integer NOT NULL,
  workout_exercise_id integer NOT NULL,
  set_number integer NOT NULL,
  weight numeric,
  reps integer,
  rir integer,
  velocity text,
  sticking_point text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
