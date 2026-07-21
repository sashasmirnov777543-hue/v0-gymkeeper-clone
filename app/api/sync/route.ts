import { NextResponse } from "next/server";
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
      velocity: "fast" | "normal" | "slow";
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
      cardioRpe: number;
      cardioTalkTest: "full_sentences" | "short_phrases" | "difficult";
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
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  await ensureSchema();

  let ops: Op[];
  try {
    const body = (await req.json()) as { ops?: Op[] };
    ops = Array.isArray(body.ops) ? body.ops : [];
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (ops.length > 200) {
    return NextResponse.json({ error: "Слишком много операций" }, { status: 413 });
  }

  if (
    ops.some(
      (op) =>
        !op ||
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

  const resolveRef = (ref: number | string): number | null =>
    typeof ref === "number" ? ref : (sessionMap.get(ref) ?? null);

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
        return { result: stored.result as StoredResult, replayed: true };
      }

      let result: StoredResult;
      switch (op.kind) {
        case "start": {
          if (cancelledLocal.has(op.localKey)) {
            result = { kind: "start", skipped: true };
            break;
          }
          if (!op.readiness) throw new Error("Для старта нужна проверка готовности");
          const assessment = assessReadiness(op.readiness);
          if (assessment.level === "red") {
            throw new Error("Красный статус блокирует тренировку и разминку");
          }
          const [program] = await tx
            .select({ programVersion: cycles.programVersion })
            .from(workouts)
            .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
            .where(eq(workouts.id, op.workoutId))
            .limit(1);
          const inserted = await tx
            .insert(sessions)
            .values({
              workoutId: op.workoutId,
              startedAt: new Date(op.startedAt),
              status: "active",
              programVersion: program?.programVersion ?? "h2-v9-1.0",
              sleepMinutes: op.readiness.sleepMinutes,
              sleepQuality: op.readiness.sleepQuality,
              shoulderPain: op.readiness.shoulderPain,
              backPain: op.readiness.backPain,
              energy: op.readiness.energy,
              morningPulseDelta:
                op.readiness.restingHeartRateTrend?.deltaFromBaselineBpm != null
                  ? Math.round(op.readiness.restingHeartRateTrend.deltaFromBaselineBpm)
                  : null,
              readinessLevel: assessment.level,
              readinessInput: op.readiness,
              readinessReasons: assessment.reasonCodes,
              adaptationPlan: assessment.permittedAction,
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
          result = { kind: "start", sessionId };
          break;
        }
        case "set": {
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId == null) {
            result = { kind: "set", skipped: true };
            break;
          }
          const [valid] = await tx.select({id:sessions.id}).from(sessions).innerJoin(workouts,eq(sessions.workoutId,workouts.id)).innerJoin(workoutExercises,eq(workoutExercises.workoutId,workouts.id)).where(sql`${sessions.id}=${sessionId} and ${sessions.status}='active' and ${sessions.safetyStopped}=false and ${workoutExercises.id}=${op.workoutExerciseId}`).limit(1);
          if(!valid) throw new Error("Подход не принадлежит активной сессии");
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
              ["medical_symptom", "pain_changes_movement", "unsafe_loss_of_control"].includes(value),
            )
          ) {
            await tx
              .update(sessions)
              .set({ safetyStopped: true })
              .where(eq(sessions.id, sessionId));
          }
          result = { kind: "set", sessionId, setId: inserted.id };
          break;
        }
        case "updateSet": {
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId == null) {
            result = { kind: "updateSet", skipped: true };
            break;
          }
          if (
            (op.rpe != null && (!Number.isFinite(op.rpe) || op.rpe < 0 || op.rpe > 10)) ||
            (op.rir != null && (!Number.isInteger(op.rir) || op.rir < 0 || op.rir > 10))
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
          if (!updated.length) throw new Error("Подход не принадлежит активной сессии");
          result = { kind: "updateSet", sessionId, setId: op.setId };
          break;
        }
        case "finish": {
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId == null) {
            result = { kind: "finish", skipped: true };
            break;
          }
          const completed = await tx
            .update(sessions)
            .set({ status: "completed", finishedAt: new Date(op.finishedAt) })
            .where(sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`)
            .returning({ workoutId: sessions.workoutId });
          if (!completed.length) throw new Error("Сессия уже завершена или не найдена");
          const [position] = await tx
            .select({ dayOffset: cycles.dayOffset, dayInCycle: workouts.dayInCycle })
            .from(workouts)
            .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
            .where(eq(workouts.id, completed[0].workoutId))
            .limit(1);
          if (position?.dayOffset != null && position.dayInCycle != null) {
            const nextDay = Math.min(176, position.dayOffset + position.dayInCycle + 1);
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
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId == null) {
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
            })
            .where(sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`)
            .returning({ workoutId: sessions.workoutId });
          if (!completed.length) throw new Error("Кардио уже завершено или не найдено");
          const [position] = await tx
            .select({ dayOffset: cycles.dayOffset, dayInCycle: workouts.dayInCycle })
            .from(workouts)
            .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
            .where(eq(workouts.id, completed[0].workoutId))
            .limit(1);
          if (position?.dayOffset != null && position.dayInCycle != null) {
            const nextDay = Math.min(176, position.dayOffset + position.dayInCycle + 1);
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
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId != null) {
            const [active] = await tx
              .select({ id: sessions.id })
              .from(sessions)
              .where(sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`)
              .limit(1);
            if (!active) throw new Error("Можно отменить только активную сессию");
            await tx.delete(loggedSets).where(eq(loggedSets.sessionId, sessionId));
            await tx
              .delete(sessions)
              .where(sql`${sessions.id}=${sessionId} and ${sessions.status}='active'`);
          }
          result = {
            kind: "cancel",
            sessionId: sessionId ?? undefined,
            skipped: sessionId == null,
          };
          break;
        }
        case "deleteSet": {
          await tx.delete(loggedSets).where(eq(loggedSets.id, op.setId));
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
