import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coachMessages,
  coachProposals,
  cycles,
  programState,
  rhrMeasurements,
  sessions,
  workouts,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { getProgramDayDescriptor } from "@/lib/program/calendar";
import { assessRhrTrend } from "@/lib/rhr";
import { buildCoachProgramContext } from "@/lib/coach/context";
import { askGeminiCoach } from "@/lib/coach/gemini-client";
import { validateCoachProposal } from "@/lib/coach/proposals";
import { detectCoachRedFlags, redFlagCoachResponse } from "@/lib/coach/safety";
import {
  DEFAULT_GEMINI_MODEL_ID,
  type CoachMessage,
  type CoachProposal,
} from "@/lib/coach/types";

export const dynamic = "force-dynamic";

const requests: number[] = [];
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;

function allowRequest(now = Date.now()): boolean {
  while (requests.length && requests[0] < now - RATE_WINDOW_MS) requests.shift();
  if (requests.length >= RATE_LIMIT) return false;
  requests.push(now);
  return true;
}

function configured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function runtimeContext() {
  const [stateRows, recentSessions, rhrRows, pending] = await Promise.all([
    db.select().from(programState).where(eq(programState.profileKey, "primary")).limit(1),
    db
      .select({
        id: sessions.id,
        startedAt: sessions.startedAt,
        status: sessions.status,
        readinessLevel: sessions.readinessLevel,
        readinessReasons: sessions.readinessReasons,
        adaptationPlan: sessions.adaptationPlan,
        sleepMinutes: sessions.sleepMinutes,
        sleepQuality: sessions.sleepQuality,
        shoulderPain: sessions.shoulderPain,
        backPain: sessions.backPain,
        safetyStopped: sessions.safetyStopped,
        symptoms: sessions.symptoms,
        workoutTitle: workouts.title,
        slot: workouts.label,
        block: cycles.block,
        cycleNumber: cycles.number,
      })
      .from(sessions)
      .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
      .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
      .orderBy(desc(sessions.startedAt))
      .limit(8),
    db.select().from(rhrMeasurements).orderBy(desc(rhrMeasurements.measuredOn)).limit(14),
    db
      .select({
        id: coachProposals.id,
        kind: coachProposals.kind,
        target: coachProposals.target,
        title: coachProposals.title,
        createdAt: coachProposals.createdAt,
        expiresAt: coachProposals.expiresAt,
      })
      .from(coachProposals)
      .where(eq(coachProposals.status, "pending"))
      .orderBy(desc(coachProposals.createdAt))
      .limit(10),
  ]);
  const state = stateRows[0];
  const programDay = state?.currentProgramDay ?? null;
  const descriptor =
    programDay != null && programDay >= 1 && programDay <= 176
      ? getProgramDayDescriptor(programDay)
      : null;
  const rhrTrend = assessRhrTrend(
    rhrRows.map((row) => ({
      measuredOn: row.measuredOn,
      bpm: row.bpm,
      repeatedBpm: row.repeatedBpm,
      comparable: row.comparable,
      poorWellbeing: row.poorWellbeing,
    })),
  );
  return {
    now: new Date().toISOString(),
    programVersion: state?.programVersion ?? "h2-v9-2.0",
    programDay,
    currentBlock: descriptor?.block ?? null,
    currentCycle: descriptor?.cycle ?? null,
    currentSlot: descriptor?.slot ?? null,
    rmrefKg: state?.rmrefKg ? Number(state.rmrefKg) : 115,
    readiness: recentSessions[0]
      ? {
          level: recentSessions[0].readinessLevel,
          reasons: recentSessions[0].readinessReasons,
          adaptation: recentSessions[0].adaptationPlan,
        }
      : null,
    rhrTrend,
    recentSessions: recentSessions.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
    })),
    pendingProposals: pending.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    })),
  } as const;
}

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const [messages, proposals] = await Promise.all([
    db
      .select()
      .from(coachMessages)
      .orderBy(desc(coachMessages.createdAt))
      .limit(60),
    db
      .select()
      .from(coachProposals)
      .where(eq(coachProposals.status, "pending"))
      .orderBy(desc(coachProposals.createdAt))
      .limit(20),
  ]);
  return NextResponse.json({
    configured: configured(),
    model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL_ID,
    messages: messages.reverse(),
    proposals,
  });
}

export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!allowRequest()) {
    return NextResponse.json(
      { error: "Слишком много сообщений. Подождите минуту." },
      { status: 429 },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 24_000) {
    return NextResponse.json({ error: "Сообщение слишком большое" }, { status: 413 });
  }
  let message = "";
  try {
    const body = (await request.json()) as { message?: unknown };
    message = typeof body.message === "string" ? body.message.trim() : "";
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (!message || message.length > 6_000) {
    return NextResponse.json(
      { error: "Введите сообщение длиной до 6000 символов" },
      { status: 400 },
    );
  }

  const [userRow] = await db
    .insert(coachMessages)
    .values({ role: "user", content: message })
    .returning({ id: coachMessages.id, createdAt: coachMessages.createdAt });

  const localRedFlags = detectCoachRedFlags(message);
  if (localRedFlags.length > 0) {
    const local = redFlagCoachResponse(localRedFlags);
    const [assistantRow] = await db
      .insert(coachMessages)
      .values({
        role: "assistant",
        content: local.message,
        model: "local-safety-gate",
        metadata: local,
      })
      .returning({ id: coachMessages.id, createdAt: coachMessages.createdAt });
    return NextResponse.json({
      user: { ...userRow, role: "user", content: message },
      assistant: {
        ...assistantRow,
        role: "assistant",
        content: local.message,
        questions: local.questions,
      },
      proposal: null,
      redFlagDetected: true,
    });
  }

  if (!configured()) {
    return NextResponse.json(
      {
        error:
          "Gemini 3.5 Flash ещё не подключён. Добавьте GEMINI_API_KEY из Google AI Studio в приватные переменные окружения.",
      },
      { status: 503 },
    );
  }

  const historyRows = await db
    .select({ role: coachMessages.role, content: coachMessages.content })
    .from(coachMessages)
    .orderBy(desc(coachMessages.createdAt))
    .limit(24);
  const history = historyRows
    .reverse()
    .filter(
      (row): row is { role: "user" | "assistant"; content: string } =>
        row.role === "user" || row.role === "assistant",
    ) satisfies CoachMessage[];

  try {
    const context = await runtimeContext();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const result = await askGeminiCoach({
      messages: history,
      trustedContext: buildCoachProgramContext(context),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    let proposal: CoachProposal | null = result.response.proposal;
    let proposalValidation: readonly string[] = [];
    if (proposal) {
      const checked = validateCoachProposal(proposal);
      proposalValidation = checked.errors;
      if (!checked.valid || result.response.redFlagDetected) proposal = null;
    }

    const saved = await db.transaction(async (tx) => {
      const [assistant] = await tx
        .insert(coachMessages)
        .values({
          role: "assistant",
          content: result.response.message,
          model: result.model,
          requestId: result.requestId,
          metadata: {
            questions: result.response.questions,
            redFlagDetected: result.response.redFlagDetected,
            proposalValidation,
          },
        })
        .returning({ id: coachMessages.id, createdAt: coachMessages.createdAt });
      if (!proposal) return { assistant, proposal: null };
      const expiresAt = new Date(
        Date.now() + Math.min(168, Math.max(1, proposal.expiresInHours)) * 3_600_000,
      );
      const [createdProposal] = await tx
        .insert(coachProposals)
        .values({
          messageId: assistant.id,
          kind: proposal.kind,
          target: proposal.target,
          title: proposal.title,
          rationale: proposal.rationale,
          patch: proposal.patch,
          safety: proposal.safety,
          expiresAt,
        })
        .returning();
      return { assistant, proposal: createdProposal };
    });

    return NextResponse.json({
      user: { ...userRow, role: "user", content: message },
      assistant: {
        ...saved.assistant,
        role: "assistant",
        content: result.response.message,
        questions: result.response.questions,
      },
      proposal: saved.proposal,
      redFlagDetected: result.response.redFlagDetected,
    });
  } catch (error) {
    const messageText =
      error instanceof Error && error.name === "AbortError"
        ? "Gemini не ответил за 60 секунд. Попробуйте ещё раз."
        : error instanceof Error
          ? error.message
          : "Не удалось получить ответ Gemini";
    return NextResponse.json({ error: messageText }, { status: 502 });
  }
}
