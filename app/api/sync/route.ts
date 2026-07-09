import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import { loggedSets, sessions, syncOps } from "@/lib/db/schema";
import {
  applyAmrapTmRecalcInTransaction,
  type TmRecalcResult,
} from "@/lib/tm-recalc";
import { readinessLevel, type ReadinessInput } from "@/lib/training-logic";

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
      velocity: "fast" | "normal" | "slow";
      stickingPoint: "chest" | "middle" | "lockout" | null;
    }
  | {
      kind: "finish";
      sessionRef: number | string;
      finishedAt: string;
      proposedTm?: number;
    }
  | {
      kind: "cardioFinish";
      sessionRef: number | string;
      finishedAt: string;
      durationSeconds: number;
      avgHr: number | null;
      speed: string | null;
      resistance: string | null;
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
  tmRecalc?: TmRecalcResult | null;
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
  const tmRecalcs: TmRecalcResult[] = [];

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
          const inserted = await tx
            .insert(sessions)
            .values({
              workoutId: op.workoutId,
              startedAt: new Date(op.startedAt),
              status: "active",
              ...(op.readiness
                ? {
                    ...op.readiness,
                    readinessLevel: readinessLevel(op.readiness),
                  }
                : {}),
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
          const [inserted] = await tx
            .insert(loggedSets)
            .values({
              sessionId,
              workoutExerciseId: op.workoutExerciseId,
              setNumber: op.setNumber,
              weight: op.weight != null ? String(op.weight) : null,
              reps: op.reps,
              rir: op.rir,
              velocity: op.velocity,
              stickingPoint: op.stickingPoint,
            })
            .returning({ id: loggedSets.id });
          result = { kind: "set", sessionId, setId: inserted.id };
          break;
        }
        case "finish": {
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId == null) {
            result = { kind: "finish", skipped: true };
            break;
          }
          await tx
            .update(sessions)
            .set({ status: "completed", finishedAt: new Date(op.finishedAt) })
            .where(eq(sessions.id, sessionId));
          const tmRecalc = await applyAmrapTmRecalcInTransaction(
            tx,
            sessionId,
            {
              proposedTm: op.proposedTm,
            },
          );
          result = { kind: "finish", sessionId, tmRecalc };
          break;
        }
        case "cardioFinish": {
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId == null) {
            result = { kind: "cardioFinish", skipped: true };
            break;
          }
          await tx
            .update(sessions)
            .set({
              status: "completed",
              finishedAt: new Date(op.finishedAt),
              durationSeconds: op.durationSeconds,
              avgHr: op.avgHr,
              cardioSpeed: op.speed,
              cardioResistance: op.resistance,
              cardioRpe: op.cardioRpe,
              cardioTalkTest: op.cardioTalkTest,
              cardioSymptoms: op.cardioSymptoms,
            })
            .where(eq(sessions.id, sessionId));
          result = { kind: "cardioFinish", sessionId };
          break;
        }
        case "cancel": {
          const sessionId = resolveRef(op.sessionRef);
          if (sessionId != null) {
            await tx
              .delete(loggedSets)
              .where(eq(loggedSets.sessionId, sessionId));
            await tx.delete(sessions).where(eq(sessions.id, sessionId));
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
    if (processed.result.tmRecalc) tmRecalcs.push(processed.result.tmRecalc);
    results.push({ operationId: op.operationId, ...processed });
  }

  return NextResponse.json({ ok: true, results, tmRecalcs });
}
