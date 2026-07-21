import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const cycles = pgTable("cycles", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  name: text("name").notNull(),
  macrocycle: integer("macrocycle").notNull().default(1),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Программный блок: 'v9' — силовой жимовой, 'h2' — гипертрофия/ОФП (база перед V9) */
  block: text("block").notNull().default("v9"),
  programVersion: text("program_version").notNull().default("legacy"),
  programKey: text("program_key"),
  dayOffset: integer("day_offset"),
  checkpoint: jsonb("checkpoint"),
  rules: jsonb("rules"),
});

export const workouts = pgTable("workouts", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull(),
  label: text("label").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  kind: text("kind").notNull().default("strength"),
  cardioZone: text("cardio_zone"),
  cardioMinutes: text("cardio_minutes"),
  programKey: text("program_key"),
  dayInCycle: integer("day_in_cycle"),
  warmupLevel: text("warmup_level"),
  prescription: jsonb("prescription"),
  branches: jsonb("branches"),
});

export const workoutExercises = pgTable("workout_exercises", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  name: text("name").notNull(),
  weightText: text("weight_text"),
  pctOfTm: numeric("pct_of_tm"),
  targetReps: text("target_reps"),
  targetSets: text("target_sets"),
  targetRirMin: integer("target_rir_min"),
  targetRirMax: integer("target_rir_max"),
  /** Темп/скорость выполнения, напр. "3-1-1" или "медленно" */
  tempo: text("tempo"),
  comment: text("comment"),
  restSeconds: integer("rest_seconds"),
  programKey: text("program_key"),
  role: text("role").notNull().default("accessory"),
  pctMin: numeric("pct_min"),
  pctMax: numeric("pct_max"),
  exampleKgMin: numeric("example_kg_min"),
  exampleKgMax: numeric("example_kg_max"),
  targetRpeMin: numeric("target_rpe_min"),
  targetRpeMax: numeric("target_rpe_max"),
  isOptional: boolean("is_optional").notNull().default(false),
  conditionCode: text("condition_code"),
  excludeFromTonnage: boolean("exclude_from_tonnage").notNull().default(false),
  prescription: jsonb("prescription"),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  durationSeconds: integer("duration_seconds"),
  avgHr: integer("avg_hr"),
  /** Кардио: скорость дорожки/тренажёра (свободный текст, напр. "10.5") */
  cardioSpeed: text("cardio_speed"),
  /** Кардио: уровень сопротивления тренажёра (свободный текст, напр. "8") */
  cardioResistance: text("cardio_resistance"),
  cardioRpe: integer("cardio_rpe"),
  cardioTalkTest: text("cardio_talk_test"),
  cardioSymptoms: text("cardio_symptoms"),
  cardioOverheating: integer("cardio_overheating"),
  cardioFeeling: integer("cardio_feeling"),
  sleepMinutes: integer("sleep_minutes"),
  sleepQuality: integer("sleep_quality"),
  morningPulseDelta: integer("morning_pulse_delta"),
  shoulderPain: integer("shoulder_pain"),
  backPain: integer("back_pain"),
  energy: integer("energy"),
  readinessLevel: text("readiness_level"),
  programVersion: text("program_version").notNull().default("legacy"),
  plannedFor: date("planned_for"),
  readinessInput: jsonb("readiness_input"),
  readinessReasons: jsonb("readiness_reasons"),
  adaptationPlan: jsonb("adaptation_plan"),
  redFlags: jsonb("red_flags"),
  testBranch: text("test_branch"),
  cardioModality: text("cardio_modality"),
  cardioWarmupMinutes: integer("cardio_warmup_minutes"),
  cardioMainMinutes: integer("cardio_main_minutes"),
  cardioCooldownMinutes: integer("cardio_cooldown_minutes"),
  painLocation: text("pain_location"),
  symptoms: jsonb("symptoms"),
  unusualSedation: boolean("unusual_sedation").notNull().default(false),
  medicationChanged: boolean("medication_changed").notNull().default(false),
  hydrationIssue: boolean("hydration_issue").notNull().default(false),
  illness: boolean("illness").notNull().default(false),
  safetyStopped: boolean("safety_stopped").notNull().default(false),
  videoUrl: text("video_url"),
});

export const loggedSets = pgTable("logged_sets", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  workoutExerciseId: integer("workout_exercise_id").notNull(),
  setNumber: integer("set_number").notNull(),
  weight: numeric("weight"),
  reps: integer("reps"),
  rir: integer("rir"),
  rpe: numeric("rpe"),
  velocity: text("velocity"),
  stickingPoint: text("sticking_point"),
  isWarmup: boolean("is_warmup").notNull().default(false),
  pauseQuality: text("pause_quality"),
  touchPoint: text("touch_point"),
  trajectoryQuality: text("trajectory_quality"),
  techniqueSigns: jsonb("technique_signs"),
  painScore: integer("pain_score"),
  symptoms: jsonb("symptoms"),
  videoUrl: text("video_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const tmRecalcEvents = pgTable("tm_recalc_events", {
  sessionId: integer("session_id").primaryKey(),
  targetMacro: integer("target_macro").notNull(),
  oldTm: numeric("old_tm"),
  newTm: numeric("new_tm").notNull(),
  amrapWeight: numeric("amrap_weight").notNull(),
  amrapReps: integer("amrap_reps").notNull(),
  e1rm: numeric("e1rm").notNull(),
  resultFingerprint: text("result_fingerprint").notNull().default(""),
  updatedExercises: integer("updated_exercises").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tmChangeHistory = pgTable("tm_change_history", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sessionId: integer("session_id"),
  targetMacro: integer("target_macro").notNull(),
  oldTm: numeric("old_tm"),
  newTm: numeric("new_tm").notNull(),
  amrapWeight: numeric("amrap_weight"),
  amrapReps: integer("amrap_reps"),
  e1rm: numeric("e1rm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncOps = pgTable("sync_ops", {
  operationId: text("operation_id").primaryKey(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const programState = pgTable("program_state", {
  profileKey: text("profile_key").primaryKey().default("primary"),
  programVersion: text("program_version").notNull().default("h2-v9-1.0"),
  startDate: date("start_date"),
  currentProgramDay: integer("current_program_day").notNull().default(1),
  rmrefKg: numeric("rmref_kg").notNull().default("115"),
  testDate: date("test_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryInsertions = pgTable("recovery_insertions", {
  id: serial("id").primaryKey(),
  afterProgramDay: integer("after_program_day").notNull(),
  days: integer("days").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rhrMeasurements = pgTable("rhr_measurements", {
  id: serial("id").primaryKey(),
  measuredOn: date("measured_on").notNull(),
  bpm: integer("bpm").notNull(),
  repeatedBpm: integer("repeated_bpm"),
  comparable: boolean("comparable").notNull().default(true),
  poorWellbeing: boolean("poor_wellbeing").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rmrefReviewEvents = pgTable("rmref_review_events", {
  id: serial("id").primaryKey(),
  checkpoint: text("checkpoint").notNull(),
  previousRmrefKg: numeric("previous_rmref_kg").notNull(),
  proposedRmrefKg: numeric("proposed_rmref_kg").notNull(),
  status: text("status").notNull().default("pending"),
  evidence: jsonb("evidence").notNull(),
  reasons: jsonb("reasons").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const sessionGateDecisions = pgTable("session_gate_decisions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  gate: text("gate").notNull(),
  allowed: boolean("allowed").notNull(),
  inputs: jsonb("inputs").notNull(),
  reasons: jsonb("reasons").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachMessages = pgTable("coach_messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  requestId: text("request_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachProposals = pgTable("coach_proposals", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  target: text("target").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  patch: jsonb("patch").notNull(),
  safety: jsonb("safety").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});
