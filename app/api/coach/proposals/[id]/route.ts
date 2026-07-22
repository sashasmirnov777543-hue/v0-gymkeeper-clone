import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coachProposals,
  programState,
  recoveryInsertions,
  rmrefReviewEvents,
  sessions,
  workouts,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/require-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { id } = await params;
  const proposalId = Number.parseInt(id, 10);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }
  let action: "confirm" | "reject";
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action !== "confirm" && body.action !== "reject") throw new Error();
    action = body.action;
  } catch {
    return NextResponse.json({ error: "Укажите confirm или reject" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [proposal] = await tx
        .select()
        .from(coachProposals)
        .where(
          and(
            eq(coachProposals.id, proposalId),
            eq(coachProposals.status, "pending"),
          ),
        )
        .limit(1);
      if (!proposal) throw new Error("Предложение уже обработано или не найдено");
      if (proposal.expiresAt && proposal.expiresAt.getTime() < Date.now()) {
        await tx
          .update(coachProposals)
          .set({ status: "expired", decidedAt: new Date() })
          .where(eq(coachProposals.id, proposalId));
        throw new Error("Срок предложения истёк");
      }
      if (action === "reject") {
        await tx
          .update(coachProposals)
          .set({ status: "rejected", decidedAt: new Date() })
          .where(eq(coachProposals.id, proposalId));
        return { status: "rejected" as const };
      }

      const safety = proposal.safety as {
        readinessLevel?: string;
        respectsProgramInvariants?: boolean;
      };
      if (
        safety.respectsProgramInvariants !== true ||
        safety.readinessLevel === "red"
      ) {
        throw new Error("Предложение не прошло защитную проверку");
      }
      const patch = proposal.patch as Record<string, unknown>;
      if (proposal.kind === "recovery_days") {
        const afterProgramDay = Number(patch.afterProgramDay);
        const days = Number(patch.days);
        if (
          !Number.isInteger(afterProgramDay) ||
          afterProgramDay < 1 ||
          afterProgramDay > 176 ||
          !Number.isInteger(days) ||
          days < 1 ||
          days > 4
        ) {
          throw new Error("Некорректные дни восстановления");
        }
        await tx
          .insert(recoveryInsertions)
          .values({
            afterProgramDay,
            days,
            reason:
              typeof patch.reason === "string" ? patch.reason : proposal.rationale,
          })
          .onConflictDoNothing();
      }
      if (proposal.kind === "rmref_review") {
        const [state] = await tx
          .select()
          .from(programState)
          .where(eq(programState.profileKey, "primary"))
          .limit(1);
        await tx.insert(rmrefReviewEvents).values({
          checkpoint: String(patch.checkpoint ?? ""),
          previousRmrefKg: String(state?.rmrefKg ?? 115),
          proposedRmrefKg: String(patch.proposedRmrefKg ?? state?.rmrefKg ?? 115),
          status: "pending_manual_review",
          evidence: Array.isArray(patch.evidenceSessionIds)
            ? patch.evidenceSessionIds
            : [],
          reasons: ["requires_manual_comparability_review"],
        });
      }

      if (
        proposal.kind === "session_adjustment" ||
        proposal.kind === "cardio_adjustment" ||
        proposal.kind === "test_postponement"
      ) {
        const [active] = await tx
          .select({ id: sessions.id, adaptationPlan: sessions.adaptationPlan })
          .from(sessions)
          .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
          .where(
            and(
              eq(sessions.status, "active"),
              eq(workouts.programKey, proposal.target),
            ),
          )
          .limit(1);
        if (active) {
          const current =
            active.adaptationPlan && typeof active.adaptationPlan === "object"
              ? (active.adaptationPlan as Record<string, unknown>)
              : {};
          await tx
            .update(sessions)
            .set({
              adaptationPlan: {
                ...current,
                coachAdjustment: {
                  id: proposal.id,
                  kind: proposal.kind,
                  target: proposal.target,
                  patch: proposal.patch,
                  rationale: proposal.rationale,
                  expiresAt: proposal.expiresAt?.toISOString() ?? null,
                },
              },
            })
            .where(eq(sessions.id, active.id));
        }
      }

      await tx
        .update(coachProposals)
        .set({ status: "applied", decidedAt: new Date(), appliedAt: new Date() })
        .where(eq(coachProposals.id, proposalId));
      return { status: "applied" as const };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось применить" },
      { status: 409 },
    );
  }
}
