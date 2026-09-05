import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import {
  cycles,
  loggedSets,
  programState,
  sessions,
  workoutExercises,
  workouts,
} from "../db/schema.ts";
import { assessReadiness, type ReadinessInput } from "../readiness.ts";
import { ACTIVE_PROGRAM_VERSION } from "./version.ts";
import {
  effectiveSafetyProfile,
  buildWarmup,
  formatWarmup,
  isPrimaryRole,
  safetyProfile,
  sessionStartReasons,
  sessionStopState,
  nextSetAdvice,
  techniqueClean,
  type EffortSet,
  type SafetyProfile,
} from "./policy.ts";
import { prepareExercises, type PreparedExercise } from "./session-plan.ts";
import {
  accessoryProgression,
  repeatedSchemeStart,
  type CompletedExposure,
} from "./progression.ts";

export type Store = Pick<typeof db, "select" | "insert" | "update" | "execute">;
export type StartSelection = {
  branch?: "triple" | "direct_1rm";
  readinessReviewed?: boolean;
  spotterPresent?: boolean;
  safetiesSet?: boolean;
  sideVideoReady?: boolean;
  heavyWarmup?: boolean;
  technicalIssue?: boolean;
  directOneRm?: {
    attemptPlanAgreedBeforeWarmupWithQualifiedCoach?: boolean;
    plannedAttempts?: number;
  };
};
export type Revision30Snapshot = {
  importedOffline?: boolean;
  revision: "3.0";
  baseKg: number;
  profile: SafetyProfile;
  exercises: PreparedExercise[];
  isControl: boolean;
  isDeload: boolean;
  isTaper: boolean;
  branch: string;
  workoutKey: string | null;
  createdAt: string;
  returning: boolean;
};
export function readSnapshot(value: unknown): Revision30Snapshot | null {
  const v =
    value && typeof value === "object"
      ? (value as { revision30?: Revision30Snapshot }).revision30
      : null;
  return v?.revision === "3.0" &&
    Array.isArray(v.exercises) &&
    Number.isFinite(v.baseKg)
    ? v
    : null;
}
function mappedSets(
  rows: readonly (typeof loggedSets.$inferSelect)[],
  snapshot: Revision30Snapshot,
): EffortSet[] {
  return rows.map((s) => ({
    ...s,
    role:
      snapshot.exercises.find((e) => e.id === s.workoutExerciseId)?.role ?? "",
    weight: s.weight == null ? null : Number(s.weight),
    rpe: s.rpe == null ? null : Number(s.rpe),
  }));
}

export async function createStartSnapshot(
  workoutId: number,
  readiness: ReadinessInput,
  selection: StartSelection | undefined,
  store: Store = db,
  allowLegacy = false,
  coachPatch: Record<string, unknown> = {},
) {
  const [w] = await store
    .select({
      id: workouts.id,
      kind: workouts.kind,
      prescription: workouts.prescription,
      programKey: workouts.programKey,
      warmupLevel: workouts.warmupLevel,
      block: cycles.block,
      number: cycles.number,
      programVersion: cycles.programVersion,
    })
    .from(workouts)
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .where(eq(workouts.id, workoutId))
    .limit(1);
  if (!w) throw new Error("Тренировка не найдена.");
  const assessment = assessReadiness(readiness);
  if (assessment.level === "red")
    throw new Error("Красный статус: нагрузка и разминка отменяются.");
  if (w.programVersion !== ACTIVE_PROGRAM_VERSION) {
    if (!allowLegacy)
      throw new Error(
        "Это архивная редакция. Для нового занятия откройте активную программу.",
      );
    return {
      version: w.programVersion,
      branch: null,
      snapshot: null,
      assessment,
    };
  }
  const [state] = await store
    .select()
    .from(programState)
    .where(eq(programState.profileKey, "primary"))
    .limit(1);
  const profile = safetyProfile(state?.safetyProfile);
  const baseKg = Number(state?.rmrefKg ?? 115);
  const p = (w.prescription ?? {}) as {
    isRestDay?: boolean;
    isControl?: boolean;
    isDeload?: boolean;
    isTaper?: boolean;
    branches?: Array<{ id?: string }>;
  };
  if (!selection?.readinessReviewed)
    throw new Error("Подтвердите сегодняшнюю проверку состояния.");
  if (allowLegacy && (p.isControl || selection?.branch === "direct_1rm"))
    throw new Error("Контроль и отдельная ветка 1ПМ не запускаются офлайн.");
  const absoluteCycle = w.block === "h2" ? w.number : w.number + 9;
  const finalTest = absoluteCycle === 22 && p.isControl === true;
  const branch = selection?.branch ?? "triple";
  const direct = branch === "direct_1rm";
  if (direct && !p.branches?.some((b) => b.id === "direct_1rm"))
    throw new Error("Эта замена не предусмотрена в данном занятии.");
  const recent = await store
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "completed"),
        eq(sessions.programVersion, ACTIVE_PROGRAM_VERSION),
      ),
    )
    .orderBy(desc(sessions.startedAt))
    .limit(80);
  const historySets = recent.length
    ? await store
        .select()
        .from(loggedSets)
        .where(
          inArray(
            loggedSets.sessionId,
            recent.map((s) => s.id),
          ),
        )
        .orderBy(asc(loggedSets.id))
    : [];
  let directHistoryVerified = true;
  if (finalTest && direct) {
    for (const key of ["v4:v9-8-b2", "v4:v9-10-b2", "v4:v9-12-b2"]) {
      const match = recent.find(
        (s) =>
          readSnapshot(s.adaptationPlan)?.workoutKey === key &&
          s.testBranch === "direct_1rm" &&
          !s.safetyStopped &&
          s.readinessLevel === "green",
      );
      const snap = match ? readSnapshot(match.adaptationPlan) : null;
      const done =
        match && snap
          ? mappedSets(
              historySets.filter((s) => s.sessionId === match.id),
              snap,
            )
          : [];
      if (
        !done.some(
          (s) =>
            s.role === "conditional_single" &&
            !s.isWarmup &&
            s.reps === 1 &&
            s.rpe != null &&
            s.rpe <= 8 &&
            s.weight != null &&
            techniqueClean(s) &&
            s.pauseQuality === "clean" &&
            s.touchPoint === "stable",
        )
      )
        directHistoryVerified = false;
    }
  }
  const reasons = sessionStartReasons({
    profile,
    readiness: assessment.level,
    kind: w.kind,
    isRestDay: p.isRestDay === true,
    isControl: p.isControl === true,
    directBranch: direct,
    finalTest,
    cycle: absoluteCycle,
    spotterPresent: selection?.spotterPresent === true,
    safetiesSet: selection?.safetiesSet === true,
    sideVideoReady: selection?.sideVideoReady === true,
    technicalIssue:
      selection?.technicalIssue === true || selection?.heavyWarmup === true,
    directHistoryVerified,
  });
  if (
    finalTest &&
    direct &&
    (selection?.directOneRm?.attemptPlanAgreedBeforeWarmupWithQualifiedCoach !==
      true ||
      !Number.isInteger(selection?.directOneRm?.plannedAttempts) ||
      Number(selection?.directOneRm?.plannedAttempts) < 1 ||
      Number(selection?.directOneRm?.plannedAttempts) > 3)
  )
    reasons.push("Заранее согласуйте от одной до трёх попыток.");
  if (reasons.length) throw new Error(reasons.join(" "));
  const rows = await store
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.sortOrder));
  const [lastStrength] = await store
    .select({ startedAt: sessions.startedAt, finishedAt: sessions.finishedAt })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .where(and(eq(sessions.status, "completed"), eq(workouts.kind, "strength")))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  const returning = Boolean(
    lastStrength &&
    Date.now() -
      new Date(lastStrength.finishedAt ?? lastStrength.startedAt).getTime() >=
      7 * 86400000,
  );
  if (returning && direct)
    throw new Error(
      "После паузы сначала вводная работа, не отдельная тестовая ветка.",
    );
  let prepared = prepareExercises(rows, {
    baseKg,
    profile,
    readiness: assessment.level,
    branch,
    isControl: p.isControl === true,
    isDeload: p.isDeload === true,
    isTaper: p.isTaper === true,
    warmupKind: w.warmupLevel,
    coachPatch,
    returning,
  });
  const exposures: CompletedExposure[] = recent.flatMap((s) => {
    const snapshot = readSnapshot(s.adaptationPlan);
    if (!snapshot || snapshot.importedOffline) return [];
    return snapshot.exercises.map((e) => ({
      sessionId: s.id,
      signature: e.signature,
      baseKg: snapshot.baseKg,
      green: s.readinessLevel === "green" && !s.safetyStopped,
      completed: true,
      plannedSets: Number(e.targetSets),
      plannedReps: e.targetReps ?? "",
      sets: mappedSets(
        historySets.filter(
          (row) => row.sessionId === s.id && row.workoutExerciseId === e.id,
        ),
        snapshot,
      ),
    }));
  });
  prepared = prepared.map((e) => {
    if (
      !isPrimaryRole(e.role) &&
      e.role !== "rehab" &&
      e.targetRirMin != null
    ) {
      const matched = exposures.filter((x) => x.signature === e.signature);
      const last = matched[0];
      const prior = matched[1];
      const done = last?.sets.filter((x) => !x.isWarmup) ?? [];
      const nums = e.targetReps?.match(/\d+/g)?.map(Number) ?? [];
      const earned =
        last?.green &&
        prior?.green &&
        accessoryProgression({
          sets: done,
          previous: prior.sets.filter((x) => !x.isWarmup),
          targetSets: Number(e.targetSets),
          repMax: Math.max(...nums),
          rirMin: e.targetRirMin,
          stepKg: 0,
        }).canIncrease;
      const weights = done.flatMap((x) => (x.weight == null ? [] : [x.weight]));
      const lastKg = weights.length ? Math.min(...weights) : null;
      return {
        ...e,
        plannedKg: lastKg,
        weightText: earned
          ? `Два полных выполнения: допустим минимальный шаг вашего снаряда; затем нижняя граница повторов.`
          : e.weightText,
        comment: earned
          ? `Предыдущий вес ${lastKg} кг. Шаг тренажёра выбирается отдельно, не от штанги.\n${e.comment ?? ""}`
          : e.comment,
      };
    }
    if (e.plannedKg == null || !e.progressionEligible) return e;
    const recommendation = repeatedSchemeStart({
      signature: e.signature,
      baseKg,
      candidateKg: e.plannedKg,
      eligible: true,
      exposures,
      profile,
    });
    return {
      ...e,
      warmupText: formatWarmup(
        buildWarmup(
          recommendation.weightKg,
          profile,
          "normal",
          recommendation.weightKg >= 90,
        ),
      ),
      progressionEligible: e.progressionEligible && !recommendation.raised,
      plannedKg: recommendation.weightKg,
      weightText: `${recommendation.weightKg} кг · старт`,
      comment: `${recommendation.reason}\n${e.comment ?? ""}`,
    };
  });
  if (finalTest && direct)
    prepared = prepared.map((e) =>
      e.role === "direct_1rm"
        ? {
            ...e,
            targetSets: String(selection?.directOneRm?.plannedAttempts ?? 1),
          }
        : e,
    );
  const snapshot: Revision30Snapshot = {
    revision: "3.0",
    baseKg,
    profile,
    exercises: prepared,
    isControl: p.isControl === true,
    isDeload: p.isDeload === true,
    isTaper: p.isTaper === true,
    branch,
    workoutKey: w.programKey,
    createdAt: new Date().toISOString(),
    returning,
  };
  return { version: w.programVersion, branch, snapshot, assessment };
}

export function validateSetNumbers(input: {
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  rpe?: number | null;
  setNumber?: number;
  painScore?: number | null;
}) {
  for (const [name, value, max, integer] of [
    ["weight", input.weight, 500, false],
    ["reps", input.reps, 100, true],
    ["rir", input.rir, 10, true],
    ["rpe", input.rpe, 10, false],
    ["painScore", input.painScore, 10, true],
  ] as const) {
    if (
      value != null &&
      (!Number.isFinite(value) ||
        value < 0 ||
        value > max ||
        (integer && !Number.isInteger(value)))
    )
      throw new Error(`Некорректное поле: ${name}`);
  }
  if (
    input.setNumber !== undefined &&
    (!Number.isInteger(input.setNumber) ||
      input.setNumber < 1 ||
      input.setNumber > 30)
  )
    throw new Error("Некорректный номер подхода.");
}
/** Runs inside the same transaction as INSERT. Serializes concurrent writes to one session. */
export async function guardSet(
  store: Store,
  sessionId: number,
  exerciseId: number,
  input: { weight: number | null; reps: number | null; isWarmup?: boolean },
  importFacts = false,
) {
  await store.execute(
    sql`SELECT id FROM sessions WHERE id=${sessionId} FOR UPDATE`,
  );
  const [session] = await store
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const [exercise] = await store
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.id, exerciseId),
        eq(workoutExercises.workoutId, session?.workoutId ?? -1),
      ),
    )
    .limit(1);
  if (!session || session.status !== "active" || !exercise)
    throw new Error("Подход не принадлежит активной сессии.");
  const snapshot = readSnapshot(session.adaptationPlan);
  if (!snapshot) {
    if (!importFacts)
      throw new Error(
        "Сессия предыдущей редакции: доступны завершение и отмена, но не новая нагрузка.",
      );
    return;
  }
  if (session.safetyStopped && !importFacts)
    throw new Error("Сессия остановлена защитным правилом.");
  const [currentState] = await store
    .select()
    .from(programState)
    .where(eq(programState.profileKey, "primary"))
    .limit(1);
  const liveProfile = effectiveSafetyProfile(
    snapshot.profile,
    safetyProfile(currentState?.safetyProfile),
  );
  if (
    !importFacts &&
    (!liveProfile.reviewed ||
      (snapshot.branch === "direct_1rm" &&
        (!liveProfile.singlesAllowed || !liveProfile.directOneRmAllowed)))
  )
    throw new Error(
      "Индивидуальный режим изменён. Завершите сессию и проверьте новые ограничения.",
    );
  const item = snapshot.exercises.find((e) => e.id === exerciseId);
  if (!item) {
    if (!importFacts)
      throw new Error(
        "Упражнение не входит в выбранную ветку и план этой сессии.",
      );
    await store
      .update(sessions)
      .set({ safetyStopped: true })
      .where(eq(sessions.id, sessionId));
    return;
  }
  const rows = await store
    .select()
    .from(loggedSets)
    .where(eq(loggedSets.sessionId, sessionId))
    .orderBy(asc(loggedSets.id));
  const decision = nextSetAdvice({
    sets: mappedSets(rows, snapshot),
    exerciseId,
    role: item.role,
    targetSets: Number(item.targetSets),
    targetRpeMax: item.targetRpeMax,
    plannedKg: item.plannedKg,
    profile: liveProfile,
    readiness: session.readinessLevel ?? "yellow",
    progressionEligible: item.progressionEligible,
    afterControlLight: item.afterControlLight,
  });
  if (decision.blocked && !importFacts) throw new Error(decision.reason);
  if (decision.blocked && importFacts)
    await store
      .update(sessions)
      .set({ safetyStopped: true })
      .where(eq(sessions.id, sessionId));
  if (
    /bench|backoff|calibration|triple|single|direct_1rm/.test(item.role) &&
    (input.weight == null || input.weight <= 0 || input.reps == null)
  )
    throw new Error("Для штанги запишите фактические вес и повторения.");
}
export async function updateSafetyFromFacts(store: Store, sessionId: number) {
  const [session] = await store
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const snap = readSnapshot(session?.adaptationPlan);
  if (!snap) return;
  const rows = await store
    .select()
    .from(loggedSets)
    .where(eq(loggedSets.sessionId, sessionId))
    .orderBy(asc(loggedSets.id));
  const [current] = await store
    .select()
    .from(programState)
    .where(eq(programState.profileKey, "primary"))
    .limit(1);
  const now = safetyProfile(current?.safetyProfile);
  const cap =
    snap.profile.loadCeilingKg == null
      ? now.loadCeilingKg
      : now.loadCeilingKg == null
        ? snap.profile.loadCeilingKg
        : Math.min(snap.profile.loadCeilingKg, now.loadCeilingKg);
  const stop = sessionStopState(mappedSets(rows, snap), {
    ...snap.profile,
    loadCeilingKg: cap,
  });
  if (stop.stopAll)
    await store
      .update(sessions)
      .set({ safetyStopped: true })
      .where(eq(sessions.id, sessionId));
}
