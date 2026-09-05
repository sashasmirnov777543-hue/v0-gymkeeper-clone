import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  createStartSnapshot,
  guardSet,
  updateSafetyFromFacts,
  validateSetNumbers,
} from "@/lib/program/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import {
  cycles,
  loggedSets,
  programState,
  sessions,
  syncOps,
  workouts,
  workoutExercises,
} from "@/lib/db/schema";
import { assessReadiness, type ReadinessInput } from "@/lib/readiness";

export const dynamic = "force-dynamic";

type OpPayload =
  | {
      kind: "start";
      localKey: string;
      workoutId: number;
      startedAt: string;
      readiness?: ReadinessInput;
      startChecks?: {
        branch?: "triple" | "direct_1rm";
        spotterPresent?: boolean;
        safetiesSet?: boolean;
        readinessReviewed?: boolean;
      };
      programVersion?: string;
      reportedBaseKg?: number;
    }
  | {
      kind: "set";
      sessionRef: number | string;
      workoutExerciseId: number;
      setNumber: number;
      weight: number | null;
      reps: number | null;
      rir: number | null;
      rpe: number | null;
      velocity: "fast" | "normal" | "slow" | null;
      stickingPoint: "chest" | "middle" | "lockout" | null;
      isWarmup?: boolean;
      pauseQuality?: string | null;
      touchPoint?: string | null;
      trajectoryQuality?: string | null;
      techniqueSigns?: string[];
      painScore?: number | null;
      symptoms?: string[];
      videoUrl?: string | null;
    }
  | {
      kind: "updateSet";
      sessionRef: number | string;
      setId: number;
      weight: number | null;
      reps: number | null;
      rir: number | null;
      rpe: number | null;
    }
  | {
      kind: "finish";
      sessionRef: number | string;
      finishedAt: string;
    }
  | {
      kind: "cardioFinish";
      sessionRef: number | string;
      finishedAt: string;
      durationSeconds: number;
      avgHr: number | null;
      speed: string | null;
      resistance: string | null;
      modality?: string | null;
      warmupMinutes?: number | null;
      mainMinutes?: number | null;
      cooldownMinutes?: number | null;
      supportLog?: { completedIds: number[]; mode: number };
      cardioRpe: number | null;
      cardioTalkTest: "full_sentences" | "short_phrases" | "difficult" | null;
      cardioSymptoms: string | null;
    }
  | { kind: "cancel"; sessionRef: number | string }
  | { kind: "deleteSet"; setId: number };

type Op = OpPayload & { operationId: string };
type StoredResult = {
  kind: Op["kind"];
  sessionId?: number;
  setId?: number;
  skipped?: boolean;
  localKey?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > 2000000)
    return NextResponse.json(
      { error: "Слишком большой пакет" },
      { status: 413 },
    );
  await ensureSchema();

  let ops: Op[];
  try {
    const body = (await req.json()) as { ops?: Op[] };
    ops = Array.isArray(body.ops) ? body.ops : [];
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (ops.length > 200) {
    return NextResponse.json(
      { error: "Слишком много операций" },
      { status: 413 },
    );
  }

  if (
    ops.some(
      (op) =>
        !op ||
        ![
          "start",
          "set",
          "updateSet",
          "finish",
          "cardioFinish",
          "cancel",
          "deleteSet",
        ].includes(op.kind) ||
        typeof op.operationId !== "string" ||
        !UUID_RE.test(op.operationId),
    )
  ) {
    return NextResponse.json(
      { error: "У каждой операции должен быть корректный operationId" },
      { status: 400 },
    );
  }

  // Локальную сессию, отменённую в той же очереди, вообще не создаём.
  const cancelledLocal = new Set(
    ops
      .filter(
        (op): op is Extract<Op, { kind: "cancel" }> =>
          op.kind === "cancel" && typeof op.sessionRef === "string",
      )
      .map((op) => op.sessionRef as string),
  );

  const sessionMap = new Map<string, number>();
  const results: Array<{
    operationId: string;
    result: StoredResult;
    replayed: boolean;
  }> = [];

  const resolveRef = async (
    ref: number | string,
    store: Pick<typeof db, "select"> = db,
  ): Promise<number | null> => {
    if (typeof ref === "number")
      return Number.isInteger(ref) && ref > 0 ? ref : null;
    const mapped = sessionMap.get(ref);
    if (mapped) return mapped;
    const [receipt] = await store
      .select({ result: syncOps.result })
      .from(syncOps)
      .where(
        sql`${syncOps.result}->>'localKey'=${ref} AND ${syncOps.result}->>'kind'='start'`,
      )
      .limit(1);
    const id = (receipt?.result as StoredResult | undefined)?.sessionId;
    return id ?? null;
  };

  for (const op of ops) {
    const processed = await db.transaction(async (tx) => {
      // Одинаковый operationId обрабатывается строго последовательно даже при
      // двух одновременных запросах с разных вкладок/повторе fetch.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${op.operationId}))`,
      );

      const [stored] = await tx
        .select({ result: syncOps.result })
        .from(syncOps)
        .where(eq(syncOps.operationId, op.operationId))
        .limit(1);
      if (stored) {
        const prior = stored.result as StoredResult;
        if (prior.kind !== op.kind)
          throw new Error(
            "Этот номер операции уже использован для другого действия.",
          );
        if (op.kind === "start" && !prior.localKey) {
          const result = { ...prior, localKey: op.localKey };
          await tx
            .update(syncOps)
            .set({ result })
            .where(eq(syncOps.operationId, op.operationId));
          return { result, replayed: true };
        }
        return { result: prior, replayed: true };
      }

      let result: StoredResult;
      switch (op.kind) {
        case "start": {
          if (cancelledLocal.has(op.localKey)) {
            result = { kind: "start", skipped: true };
            break;
          }
          if (!op.readiness)
            throw new Error("Для старта нужна проверка готовности");
          const assessment = assessReadiness(op.readiness);
          if (assessment.level === "red") {
            throw new Error("Красный статус блокирует тренировку и разминку");
          }
          const prepared = await createStartSnapshot(
            op.workoutId,
            op.readiness,
            op.startChecks,
            tx,
            true,
          );
          if (op.programVersion && op.programVersion !== prepared.version)
            throw new Error(
              "Версия локальной сессии не соответствует её тренировке.",
            );
          const reportedBase =
            typeof op.reportedBaseKg === "number" &&
            Number.isFinite(op.reportedBaseKg) &&
            op.reportedBaseKg > 0 &&
            op.reportedBaseKg <= 500
              ? op.reportedBaseKg
              : prepared.snapshot?.baseKg;
          const snapshot = prepared.snapshot
            ? {
                ...prepared.snapshot,
                baseKg: reportedBase ?? prepared.snapshot.baseKg,
                importedOffline: true,
              }
            : null;
          const inserted = await tx
            .insert(sessions)
            .values({
              workoutId: op.workoutId,
              startedAt: new Date(op.startedAt),
              status: "active",
              programVersion: prepared.version,
              testBranch: prepared.branch,
              sleepMinutes: op.readiness.sleepMinutes,
              sleepQuality: op.readiness.sleepQuality,
              shoulderPain: op.readiness.shoulderPain,
              backPain: op.readiness.backPain,
              energy: op.readiness.energy,
              morningPulseDelta:
                op.readiness.restingHeartRateTrend?.deltaFromBaselineBpm != null
                  ? Math.round(
                      op.readiness.restingHeartRateTrend.deltaFromBaselineBpm,
                    )
                  : null,
              readinessLevel: assessment.level,
              readinessInput: op.readiness,
              readinessReasons: assessment.reasonCodes,
              adaptationPlan: {
                readiness: assessment.permittedAction,
                revision30: snapshot,
              },
              redFlags: op.readiness.clinicalStopFlags ?? {},
            })
            .onConflictDoNothing()
            .returning({ id: sessions.id });
          const sessionId =
            inserted[0]?.id ??
            (
              await tx
                .select({ id: sessions.id })
                .from(sessions)
                .where(
                  sql`${sessions.workoutId} = ${op.workoutId} and ${sessions.status} = 'active'`,
                )
                .limit(1)
            )[0]?.id;
          if (sessionId == null)
            throw new Error("Не удалось создать или найти активную сессию");
          result = { kind: "start", sessionId, localKey: op.localKey };
          break;
        }
        case "set": {
          const sessionId = await resolveRef(op.sessionRef, tx);
          if (sessionId == null) {
            if (
              typeof op.sessionRef !== "string" ||
              !cancelledLocal.has(op.sessionRef)
            )
              throw new Error(
                "Не найдена исходная сессия. Операции остаются в очереди.",
              );
            result = { kind: "set", skipped: true };
            break;
          }
          validateSetNumbers(op);
          await guardSet(tx, sessionId, op.workoutExerciseId, op, true);
          const [inserted] = await tx
            .insert(loggedSets)
            .values({
              sessionId,
              workoutExerciseId: op.workoutExerciseId,
              setNumber: op.setNumber,
              weight: op.weight != null ? String(op.weight) : null,
              reps: op.reps,
              rir: op.rir,
              rpe: op.rpe != null ? String(op.rpe) : null,
              velocity: op.velocity,
              stickingPoint: op.stickingPoint,
              isWarmup: op.isWarmup ?? false,
              pauseQuality: op.pauseQuality ?? null,
              touchPoint: op.touchPoint ?? null,
              trajectoryQuality: op.trajectoryQuality ?? null,
              techniqueSigns: op.techniqueSigns ?? [],
              painScore: op.painScore ?? null,
              symptoms: op.symptoms ?? [],
              videoUrl: op.videoUrl ?? null,
            })
            .returning({ id: loggedSets.id });
          if (
            op.symptoms?.some((value) =>
              [
                "medical_symptom",
                "pain_changes_movement",
                "unsafe_loss_of_control",
              ].includes(value),
            )
          ) {
            await tx
              .update(sessions)
              .set({ safetyStopped: true })
              .where(eq(sessions.id, sessionId));
          }
          await updateSafetyFromFacts(tx, sessionId);
          result = { kind: "set", sessionId, setId: inserted.id };
          break;
        }
        case "updateSet": {
          validateSetNumbers(op);
          const sessionId = await resolveRef(op.sessionRef, tx);
          if (sessionId == null) {
            if (
              typeof op.sessionRef !== "string" ||
              !cancelledLocal.has(op.sessionRef)
            )
              throw new Error(
                "Не найдена исходная сессия. Операции остаются в очереди.",
              );
            result = { kind: "updateSet", skipped: true };
            break;
          }
          if (
            (op.rpe != null &&
              (!Number.isFinite(op.rpe) || op.rpe < 0 || op.rpe > 10)) ||
            (op.rir != null &&
              (!Number.isInteger(op.rir) || op.rir < 0 || op.rir > 10))
          ) {
            throw new Error("Некорректные RPE/RIR");
          }
          const updated = await tx
            .update(loggedSets)
            .set({
              weight: op.weight != null ? String(op.weight) : null,
              reps: op.reps,
              rir: op.rir,
              rpe: op.rpe != null ? String(op.rpe) : null,
            })
            .where(
              sql`${loggedSets.id}=${op.setId} and ${loggedSets.sessionId}=${sessionId} and exists (select 1 from sessions where ${sessions.id}=${sessionId} and ${sessions.status}='active')`,
            )
            .returning({ id: loggedSets.id });
          if (!updated.length)
            throw new Error("Подход не принадлежит активной сессии");
          await updateSafetyFromFacts(tx, sessionId);
          result = { kind: "updateSet", sessionId, setId: op.setId };
          break;
        }
        case "finish": {
          const sessionId = await resolveRef(op.sessionRef, tx);
          if (sessionId == null) {
            if (
              typeof op.sessionRef !== "string" ||
              !cancelledLocal.has(op.sessionRef)
            )
              throw new Error(
                "Не найдена исходная сессия. Операции остаются в очереди.",
              );
            result = { kind: "finish", skipped: true };
            break;
          }
          const completed = await tx
            .update(sessions)
            .set({ status: "completed", finishedAt: new Date(op.finishedAt) })
            .where(
              sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`,
            )
            .returning({ workoutId: sessions.workoutId });
          if (!completed.length)
            throw new Error("Сессия уже завершена или не найдена");
          const [position] = await tx
            .select({
              dayOffset: cycles.dayOffset,
              dayInCycle: workouts.dayInCycle,
            })
            .from(workouts)
            .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
            .where(eq(workouts.id, completed[0].workoutId))
            .limit(1);
          if (position?.dayOffset != null && position.dayInCycle != null) {
            const nextDay = Math.min(
              176,
              position.dayOffset + position.dayInCycle + 1,
            );
            await tx
              .update(programState)
              .set({
                currentProgramDay: sql`greatest(${programState.currentProgramDay}, ${nextDay})`,
                updatedAt: new Date(),
              })
              .where(eq(programState.profileKey, "primary"));
          }
          result = { kind: "finish", sessionId };
          break;
        }
        case "cardioFinish": {
          if (
            !Number.isFinite(op.durationSeconds) ||
            op.durationSeconds < 0 ||
            op.durationSeconds > 86400 ||
            (op.cardioRpe != null &&
              (!Number.isFinite(op.cardioRpe) ||
                op.cardioRpe < 0 ||
                op.cardioRpe > 10))
          )
            throw new Error("Некорректные фактические параметры кардио.");
          const sessionId = await resolveRef(op.sessionRef, tx);
          if (sessionId == null) {
            if (
              typeof op.sessionRef !== "string" ||
              !cancelledLocal.has(op.sessionRef)
            )
              throw new Error(
                "Не найдена исходная сессия. Операции остаются в очереди.",
              );
            result = { kind: "cardioFinish", skipped: true };
            break;
          }
          const completed = await tx
            .update(sessions)
            .set({
              status: "completed",
              finishedAt: new Date(op.finishedAt),
              durationSeconds: op.durationSeconds,
              avgHr: op.avgHr,
              cardioSpeed: op.speed,
              cardioResistance: op.resistance,
              cardioModality: op.modality ?? null,
              cardioWarmupMinutes: op.warmupMinutes ?? null,
              cardioMainMinutes: op.mainMinutes ?? null,
              cardioCooldownMinutes: op.cooldownMinutes ?? null,
              cardioRpe: op.cardioRpe,
              cardioTalkTest: op.cardioTalkTest,
              cardioSymptoms: op.cardioSymptoms,
              supportLog: op.supportLog ?? null,
            })
            .where(
              sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`,
            )
            .returning({ workoutId: sessions.workoutId });
          if (!completed.length)
            throw new Error("Кардио уже завершено или не найдено");
          const [position] = await tx
            .select({
              dayOffset: cycles.dayOffset,
              dayInCycle: workouts.dayInCycle,
            })
            .from(workouts)
            .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
            .where(eq(workouts.id, completed[0].workoutId))
            .limit(1);
          if (position?.dayOffset != null && position.dayInCycle != null) {
            const nextDay = Math.min(
              176,
              position.dayOffset + position.dayInCycle + 1,
            );
            await tx
              .update(programState)
              .set({
                currentProgramDay: sql`greatest(${programState.currentProgramDay}, ${nextDay})`,
                updatedAt: new Date(),
              })
              .where(eq(programState.profileKey, "primary"));
          }
          result = { kind: "cardioFinish", sessionId };
          break;
        }
        case "cancel": {
          const sessionId = await resolveRef(op.sessionRef, tx);
          if (sessionId != null) {
            const [active] = await tx
              .select({ id: sessions.id })
              .from(sessions)
              .where(
                sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`,
              )
              .limit(1);
            if (!active)
              throw new Error("Можно отменить только активную сессию");
            await tx
              .delete(loggedSets)
              .where(eq(loggedSets.sessionId, sessionId));
            await tx
              .delete(sessions)
              .where(
                sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`,
              );
          }
          result = {
            kind: "cancel",
            sessionId: sessionId ?? undefined,
            skipped: sessionId == null,
          };
          break;
        }
        case "deleteSet": {
          const removed = await tx
            .delete(loggedSets)
            .where(
              sql`${loggedSets.id}=${op.setId} AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=${loggedSets.sessionId} AND s.status='active')`,
            )
            .returning({ id: loggedSets.id });
          if (!removed.length)
            throw new Error("Можно удалить только подход активной сессии.");
          result = { kind: "deleteSet", setId: op.setId };
          break;
        }
      }

      await tx.insert(syncOps).values({ operationId: op.operationId, result });
      return { result, replayed: false };
    });

    if (op.kind === "start" && processed.result.sessionId != null) {
      sessionMap.set(op.localKey, processed.result.sessionId);
    }
    results.push({ operationId: op.operationId, ...processed });
  }

  return NextResponse.json({ ok: true, results });
}
