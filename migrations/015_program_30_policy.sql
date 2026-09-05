-- Additive revision 3.0 policy. Never convert old percentage levels into permission.
ALTER TABLE program_state ADD COLUMN IF NOT EXISTS safety_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE program_state ALTER COLUMN program_version SET DEFAULT 'h2-v9-4.0';
-- Existing rmref_kg, dates, current day, sessions and logged_sets are deliberately untouched.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS support_log jsonb;
