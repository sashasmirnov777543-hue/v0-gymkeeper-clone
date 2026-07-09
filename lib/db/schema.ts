import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
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
});

export const loggedSets = pgTable("logged_sets", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  workoutExerciseId: integer("workout_exercise_id").notNull(),
  setNumber: integer("set_number").notNull(),
  weight: numeric("weight"),
  reps: integer("reps"),
  rir: integer("rir"),
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
  updatedExercises: integer("updated_exercises").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncOps = pgTable("sync_ops", {
  operationId: text("operation_id").primaryKey(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
