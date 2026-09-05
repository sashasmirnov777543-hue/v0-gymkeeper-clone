"use server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  programState,
  sessions,
  loggedSets,
  workoutExercises,
  rmrefReviewEvents,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/require-auth";
import {
  safetyProfile,
  comparableTripleIndex,
  techniqueClean,
  isPrimaryRole,
} from "@/lib/program/policy";
import {
  reviewTrainingBase,
  type BaseEvidence,
} from "@/lib/program/progression";
import { readSnapshot } from "@/lib/program/server";
import { ACTIVE_PROGRAM_VERSION } from "@/lib/program/version";
const yes = (f: FormData, k: string) => f.get(k) === "on";
export async function saveSafetyProfile(form: FormData) {
  await requireAuth();
  const base = Number(form.get("baseKg"));
  const rawCap = String(form.get("loadCeilingKg") ?? "").trim();
  const cap = rawCap ? Number(rawCap) : null;
  const step = Number(form.get("weightStepKg"));
  const bar = Number(form.get("barWeightKg"));
  const support = Number(form.get("supportMode"));
  if (
    !Number.isFinite(base) ||
    base <= 0 ||
    base > 500 ||
    (cap != null && (!Number.isFinite(cap) || cap <= 0 || cap > 500)) ||
    ![0.5, 1, 1.25, 2.5, 5].includes(step) ||
    !Number.isFinite(bar) ||
    bar <= 0 ||
    bar > 30 ||
    !Number.isInteger(support) ||
    support < 0 ||
    support > 6
  )
    throw new Error("Проверьте базу, предел и доступный шаг веса.");
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT profile_key FROM program_state WHERE profile_key='primary' FOR UPDATE`,
    );
    const [state] = await tx
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1);
    const prior = safetyProfile(state?.safetyProfile);
    const day = state?.currentProgramDay ?? 1;
    if (prior.baseConfirmed && base > Number(state?.rmrefKg ?? 115))
      throw new Error(
        "Повышение R выполняется отдельно по контролю и двум обычным сессиям.",
      );
    const direct = form.get("testBranch") === "direct_1rm";
    if (direct && !prior.selectedBeforeCycle17 && day >= 129)
      throw new Error("Отдельную ветку 1ПМ нужно выбрать до Ц17.");
    const confirmed = yes(form, "confirmedAtCycle20");
    if (confirmed && !prior.confirmedAtCycle20 && (day < 153 || day > 160))
      throw new Error("Повторное решение принимается в Ц20, не заранее.");
    const next = safetyProfile({
      reviewed: yes(form, "reviewed"),
      baseConfirmed: yes(form, "baseConfirmed"),
      loadCeilingKg: cap,
      weightStepKg: step,
      barWeightKg: bar,
      notes: String(form.get("policyNotes") ?? ""),
      controlEffortAllowed: yes(form, "controlEffortAllowed"),
      singlesAllowed: yes(form, "singlesAllowed"),
      directOneRmAllowed: yes(form, "directOneRmAllowed"),
      testBranch: direct ? "direct_1rm" : "triple",
      selectedBeforeCycle17:
        prior.selectedBeforeCycle17 || (direct && day < 129),
      confirmedAtCycle20: confirmed,
      supportMode: support,
      optionalLegs: yes(form, "optionalLegs"),
    });
    if (direct && (!next.singlesAllowed || !next.directOneRmAllowed))
      throw new Error(
        "Для этой ветки нужны отдельно согласованные подготовительные синглы и тест.",
      );
    await tx
      .insert(programState)
      .values({
        profileKey: "primary",
        programVersion: ACTIVE_PROGRAM_VERSION,
        rmrefKg: String(base),
        safetyProfile: next,
      })
      .onConflictDoUpdate({
        target: programState.profileKey,
        set: {
          rmrefKg: String(base),
          safetyProfile: next,
          updatedAt: new Date(),
        },
      });
  });
  revalidatePath("/settings");
  revalidatePath("/workout", "layout");
  revalidatePath("/session", "layout");
}
export async function reviewBase(form: FormData) {
  await requireAuth();
  const proposed = Number(form.get("proposedRmrefKg"));
  if (!Number.isFinite(proposed) || proposed <= 0 || proposed > 500)
    throw new Error("Некорректная предложенная база R.");
  const ids = ["controlSessionId", "ordinarySessionId1", "ordinarySessionId2"]
    .map((k) => Number(form.get(k)))
    .filter((n) => Number.isInteger(n) && n > 0);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT profile_key FROM program_state WHERE profile_key='primary' FOR UPDATE`,
    );
    const [state] = await tx
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1);
    const current = Number(state?.rmrefKg ?? 115);
    const profile = safetyProfile(state?.safetyProfile);
    const selected = ids.length
      ? await tx.select().from(sessions).where(inArray(sessions.id, ids))
      : [];
    const facts = ids.length
      ? await tx
          .select()
          .from(loggedSets)
          .where(inArray(loggedSets.sessionId, ids))
      : [];
    const evidence: BaseEvidence[] = [];
    // The older comparable control must actually precede the selected control.
    // numeric-колонки приходят строками — приводим к числам один раз здесь,
    // чтобы set соответствовал EffortSet (как в rows ниже).
    const priorControls = (
      await tx
        .select({ set: loggedSets, session: sessions })
        .from(loggedSets)
        .innerJoin(sessions, eq(loggedSets.sessionId, sessions.id))
        .innerJoin(
          workoutExercises,
          eq(loggedSets.workoutExerciseId, workoutExercises.id),
        )
        .where(
          and(
            eq(sessions.status, "completed"),
            eq(sessions.programVersion, ACTIVE_PROGRAM_VERSION),
            eq(loggedSets.isWarmup, false),
            inArray(workoutExercises.role, ["calibration", "test_triple"]),
          ),
        )
        .orderBy(desc(sessions.startedAt))
        .limit(30)
    ).map((p) => ({
      ...p,
      set: {
        ...p.set,
        weight: p.set.weight == null ? null : Number(p.set.weight),
        rpe: p.set.rpe == null ? null : Number(p.set.rpe),
      },
    }));
    for (const session of selected) {
      const snapshot = readSnapshot(session.adaptationPlan);
      if (!snapshot || snapshot.baseKg !== current) continue;
      const rows = facts
        .filter((s) => s.sessionId === session.id && !s.isWarmup)
        .map((s) => ({
          ...s,
          role:
            snapshot.exercises.find((e) => e.id === s.workoutExerciseId)
              ?.role ?? "",
          weight: s.weight == null ? null : Number(s.weight),
          rpe: s.rpe == null ? null : Number(s.rpe),
        }));
      const control = rows.find(
        (s) => s.role === "calibration" || s.role === "test_triple",
      );
      const explicit = (s: (typeof rows)[number]) =>
        techniqueClean(s) &&
        s.pauseQuality === "clean" &&
        s.touchPoint === "stable" &&
        s.trajectoryQuality === "clean";
      let progress = false;
      if (control && snapshot.profile.controlEffortAllowed) {
        const index = comparableTripleIndex(
          control.weight ?? 0,
          control.reps ?? 0,
          control.rpe ?? NaN,
          explicit(control),
        );
        const older = priorControls.find(
          (p) =>
            p.session.id !== session.id &&
            p.session.startedAt < session.startedAt &&
            p.session.readinessLevel === "green" &&
            !p.session.safetyStopped &&
            readSnapshot(p.session.adaptationPlan)?.baseKg === current &&
            p.set.reps === 3 &&
            p.set.rpe != null &&
            Math.abs(Number(p.set.rpe) - 8) <= 0.25 &&
            p.set.pauseQuality === "clean" &&
            p.set.touchPoint === "stable" &&
            p.set.trajectoryQuality === "clean" &&
            techniqueClean(p.set),
        );
        const previous =
          older?.set.weight == null ? null : Number(older.set.weight) / 0.863;
        progress =
          index != null &&
          index > current &&
          previous != null &&
          index > previous &&
          yes(form, "controlProgressConfirmed");
      } else if (!control) {
        const primary = snapshot.exercises.filter((e) => isPrimaryRole(e.role));
        progress =
          primary.length > 0 &&
          primary.every((e) => {
            const done = rows.filter((s) => s.workoutExerciseId === e.id);
            return (
              done.length === Number(e.targetSets) &&
              done.every(
                (s) =>
                  s.reps === Number(e.targetReps) &&
                  s.weight != null &&
                  s.weight > 0 &&
                  s.rpe != null &&
                  s.rpe <= 7 &&
                  explicit(s),
              )
            );
          });
      }
      evidence.push({
        sessionId: session.id,
        kind: control ? "control" : "ordinary",
        green: session.readinessLevel === "green" && !session.safetyStopped,
        completed: session.status === "completed",
        comparable: snapshot.baseKg === current,
        progressConfirmed: progress,
      });
    }
    if (proposed > current && !profile.baseConfirmed)
      throw new Error(
        "Сначала задайте подтверждённый исходный ориентир, а не повышение из неполных данных.",
      );
    const decision = reviewTrainingBase({
      current,
      proposed,
      programDay: state?.currentProgramDay ?? 1,
      evidence,
      baseConfirmed: profile.baseConfirmed,
    });
    if (!decision.allowed) throw new Error(decision.reasons.join(" "));
    const changed = await tx
      .update(programState)
      .set({ rmrefKg: String(proposed), updatedAt: new Date() })
      .where(
        and(
          eq(programState.profileKey, "primary"),
          eq(programState.rmrefKg, String(current)),
        ),
      )
      .returning({ key: programState.profileKey });
    if (!changed.length)
      throw new Error("База изменилась; повторите проверку.");
    await tx.insert(rmrefReviewEvents).values({
      checkpoint: `day-${state?.currentProgramDay ?? 1}`,
      previousRmrefKg: String(current),
      proposedRmrefKg: String(proposed),
      status: "applied",
      evidence,
      reasons: [
        proposed > current
          ? "control_and_two_ordinary_sessions"
          : "explicit_conservative_review",
      ],
    });
  });
  revalidatePath("/settings");
  revalidatePath("/stats");
  revalidatePath("/workout", "layout");
}
