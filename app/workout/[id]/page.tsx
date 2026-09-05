import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  programState,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import { BottomNav } from "@/components/bottom-nav";
import { StartWorkoutButton } from "@/components/start-workout-button";
import { ExerciseGuideButton } from "@/components/exercise-guide-sheet";
import { ProgramNotes } from "@/components/program-notes";
import { safetyProfile } from "@/lib/program/policy";
import { prepareExercises } from "@/lib/program/session-plan";
import { ACTIVE_PROGRAM_VERSION } from "@/lib/program/version";
import type { ProgramWorkout } from "@/lib/program/types";

export const dynamic = "force-dynamic";
export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [w] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, id))
    .limit(1);
  if (!w) notFound();
  const [[cycle], raw, active, [state]] = await Promise.all([
    db.select().from(cycles).where(eq(cycles.id, w.cycleId)).limit(1),
    db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, id))
      .orderBy(asc(workoutExercises.sortOrder)),
    db.select().from(sessions).where(eq(sessions.status, "active")).limit(1),
    db
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1),
  ]);
  const p = w.prescription as ProgramWorkout;
  const profile = safetyProfile(state?.safetyProfile);
  const baseKg = Number(state?.rmrefKg ?? 115);
  const legacy = cycle?.programVersion !== ACTIVE_PROGRAM_VERSION;
  const branches = p?.branches ?? [];
  const branch =
    profile.testBranch === "direct_1rm" &&
    branches.some((b) => b.id === "direct_1rm")
      ? "direct_1rm"
      : "triple";
  const list = legacy
    ? raw.map((e) => ({
        ...e,
        condition: e.conditionCode,
        warmupText: null,
        plannedKg: null,
      }))
    : prepareExercises(raw, {
        baseKg,
        profile,
        readiness: "green",
        branch,
        isControl: p?.isControl === true,
        isDeload: p?.isDeload === true,
        isTaper: p?.isTaper === true,
        warmupKind: w.warmupLevel,
      });
  const rest = p?.isRestDay === true;
  const day = (cycle?.dayOffset ?? 0) + (w.dayInCycle ?? 0);
  return (
    <div className="min-h-dvh bg-background pb-56">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-5">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground"
          >
            ← Программа
          </Link>
          <p className="text-sm font-semibold text-primary">
            {legacy ? "Архивная редакция" : "Редакция 3.0"} · день {day}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{w.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {cycle?.block.toUpperCase()}-{cycle?.number} · {w.label}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {rest ? (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xl font-bold">
              Сегодня нет тренировочной задачи
            </h2>
            <p className="mt-2 text-base leading-relaxed">
              0 минут кардио и 0 подходов поддерживающего комплекса. Не
              добавлять «обязательную разминку». Привычная бытовая активность
              без утомления; назначения специалиста самостоятельно не отменять.
            </p>
          </section>
        ) : w.kind === "cardio" ? (
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="text-3xl font-bold">
              {p?.duration?.min ?? "—"} минут всего
            </p>
            <p className="mt-2 text-base leading-relaxed">
              {p?.cardio?.prescriptionText ?? w.cardioMinutes}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              При жёлтом статусе не более min(план, 15 минут), легко. При
              оранжевом отдых или привычная безопасная прогулка; при красном
              никаких тренировочных замен.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-lg font-bold">R и ограничения</h2>
            <p className="mt-2 text-base">
              R = {baseKg} кг
              {!profile.baseConfirmed ? " · ещё не подтверждена" : ""}.{" "}
              {profile.loadCeilingKg != null
                ? `Личный предел C = ${profile.loadCeilingKg} кг.`
                : "Числовой предел C не записан — это не означает разрешение на максимум."}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Старт W115 × R / 115, затем округление и отдельный предел C.
              Расписание не требует повышения веса. Итоговая подсказка при
              старте учитывает сопоставимую историю и готовность.
            </p>
            {profile.notes && (
              <p className="mt-3 rounded-lg bg-secondary p-3 text-sm whitespace-pre-wrap">
                {profile.notes}
              </p>
            )}
            {!profile.reviewed && (
              <Link
                href="/settings"
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary"
              >
                Сначала уточнить индивидуальный режим →
              </Link>
            )}
          </section>
        )}
        {list.map((e, i) => (
          <section
            key={e.id}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {w.kind === "cardio"
                ? "Необязательная поддержка"
                : `Упражнение ${i + 1}`}
            </p>
            <div className="mt-1 flex items-start gap-2">
              <h2 className="min-w-0 flex-1 text-xl font-bold leading-snug">
                {e.name}
              </h2>
              <ExerciseGuideButton exerciseName={e.name} />
            </div>
            <p className="mt-3 font-mono text-lg font-semibold">
              {e.targetSets} × {e.targetReps}
            </p>
            {e.weightText && (
              <p className="mt-1 text-base text-primary">{e.weightText}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                RPE{" "}
                {e.targetRpeMin == null
                  ? e.targetRpeMax != null
                    ? `≤${e.targetRpeMax}`
                    : "—"
                  : `${e.targetRpeMin}${e.targetRpeMin !== e.targetRpeMax ? `–${e.targetRpeMax}` : ""}`}
              </span>
              {e.targetRirMin != null && (
                <span>
                  RIR {e.targetRirMin}
                  {e.targetRirMax != null && e.targetRirMax !== e.targetRirMin
                    ? `–${e.targetRirMax}`
                    : e.targetRirMax == null
                      ? "+"
                      : ""}
                </span>
              )}
              {e.restSeconds != null && (
                <span>
                  Отдых{" "}
                  {e.restSeconds >= 60
                    ? `${e.restSeconds / 60} мин`
                    : `${e.restSeconds} с`}
                </span>
              )}
            </div>
            {e.warmupText && (
              <div className="mt-3 rounded-lg bg-secondary p-3 text-sm">
                <strong>Разминка под выбранный вес</strong>
                <p className="mt-1 font-mono leading-relaxed">{e.warmupText}</p>
                <p className="mt-2">
                  До штанги: 5–7 минут легко и 1×8 движений лопатками. Между
                  ступенями 60–90 с; перед работой 2–4 минуты, перед КТ 4–5.
                </p>
              </div>
            )}
            {e.comment && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {e.comment}
              </p>
            )}
          </section>
        ))}
        {w.kind === "cardio" && !rest && list.length === 0 && (
          <p className="rounded-xl border border-border p-4 text-sm">
            Дополнительный комплекс сейчас не добавляется. Он не обязателен и не
            прогрессирует по календарю.
          </p>
        )}
        {branches.length > 0 && (
          <section className="rounded-xl border border-border p-4">
            <h2 className="font-bold">Одна жимовая ветка, не две</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Показана{" "}
              {branch === "direct_1rm"
                ? "отдельная ветка 1ПМ"
                : "основная ветка с тройкой в финале"}
              . Альтернатива выбирается до разминки только при выполнении
              условий; её жимовая работа заменяет основную, а не прибавляется к
              ней.
            </p>
            <Link
              href="/settings"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
            >
              Проверить выбранную ветку →
            </Link>
          </section>
        )}
        {w.notes && <ProgramNotes text={w.notes} />}
        <Link
          href="/program-guide"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Правила, контроль, поддержка и источники →
        </Link>
      </main>
      {!rest && !legacy && (
        <div className="fixed inset-x-0 bottom-32 z-[60]">
          <div className="mx-auto max-w-lg px-4">
            <StartWorkoutButton
              workoutId={id}
              workoutKind={w.kind}
              hasActive={active.length > 0}
              activeSessionId={active[0]?.id}
              testBranches={branches.map((b) => ({
                id: b.id,
                name: b.name,
                default: b.default,
              }))}
              isControl={p?.isControl === true}
              finalTest={day === 172}
              initialBranch={branch}
              profile={profile}
              absoluteCycle={
                cycle?.block === "h2" ? cycle.number : (cycle?.number ?? 0) + 9
              }
            />
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
