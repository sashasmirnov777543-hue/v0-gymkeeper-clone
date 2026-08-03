export type ProgramBlock = "h2" | "v9";
export type WorkoutSlot = "B1" | "B2" | "B3" | "B4";
export type WorkoutKind = "cardio" | "strength";
export type ClearanceLevelId = "level_1" | "level_2" | "level_3";

export type NumericRange = Readonly<{
  min: number | null;
  max: number | null;
}>;

export type MinuteRange = Readonly<{
  min: number;
  max: number;
}>;

export type CardioPrescription = Readonly<{
  zone?: "Z1" | "Z2" | null;
  warmupMinutes?: number;
  mainMinutes?: MinuteRange;
  cooldownMinutes?: number;
  modality?: string;
  prescriptionText?: string;
}>;

export type ProgramExercise = Readonly<{
  id: string;
  key: string;
  name: string;
  sets: string;
  reps: string;
  percent: NumericRange | null;
  exampleKg: NumericRange | null;
  targetRpe: NumericRange | null;
  targetRir: NumericRange | null;
  role: string;
  optional: boolean;
  condition: string | null;
  excludeFromTonnage: boolean;
  /**
   * Подход лежит ниже валидированного диапазона шкалы RPE, поэтому числовой цели нет.
   * Редакция 2.0 печатала здесь экстраполированные значения вплоть до отрицательных;
   * 2.1 не печатает число там, где шкала не измеряла.
   */
  belowScale?: boolean;
  /**
   * Последний подход выполняется, только если предыдущий пришёл в целевой RPE:
   * при консервативной оценке накопления усталости он выходит за RPE 8.
   */
  conditionalLastSet?: boolean;
  notes: readonly string[];
}>;

export type ProgramTestBranch = Readonly<{
  id: "triple" | "direct_1rm" | string;
  default: boolean;
  name: string;
  objective?: string;
  conditions?: readonly string[];
  exercises?: readonly ProgramExercise[];
  notes?: readonly string[];
  [key: string]: unknown;
}>;

export type ProgramWorkout = Readonly<{
  id: string;
  slot: WorkoutSlot;
  day: 3 | 4 | 7 | 8;
  kind: WorkoutKind;
  title: string;
  duration: MinuteRange | null;
  cardio: CardioPrescription | null;
  warmupLevel: string | null;
  exercises: readonly ProgramExercise[];
  notes: readonly string[];
  branches: readonly ProgramTestBranch[];
}>;

export type ProgramCheckpoint = Readonly<{
  id: string;
  description?: string;
  type?: string;
  [key: string]: unknown;
}>;

export type ProgramCycle = Readonly<{
  id: string;
  block: ProgramBlock;
  number: number;
  name: string;
  objective: string;
  checkpoint: ProgramCheckpoint | null;
  workouts: readonly ProgramWorkout[];
  rules: readonly string[];
  sourceLines: string;
  programVersion: string;
  dayOffset: number;
  peakSchedule?: unknown;
}>;

export type ProgramDefinition = Readonly<{
  version: "h2-v9-3.0";
  source: Readonly<{
    title: string;
    revision: string;
    date: string;
    authority: string;
  }>;
  durationDays: 176;
  cycleLengthDays: 8;
  defaultRmrefKg: 115;
  workoutSlots: Readonly<Record<WorkoutSlot, 3 | 4 | 7 | 8>>;
  clearanceLevels?: readonly Readonly<{
    id: string;
    name: string;
    ceilingPercent: number;
    singlesAllowed: boolean;
    directOneRmAllowed: boolean;
  }>[];
  cycles: readonly ProgramCycle[];
}>;

export type ProgramValidationResult = Readonly<{
  valid: boolean;
  errors: readonly string[];
  counts: Readonly<{
    cycles: number;
    workouts: number;
    exercises: number;
  }>;
}>;
