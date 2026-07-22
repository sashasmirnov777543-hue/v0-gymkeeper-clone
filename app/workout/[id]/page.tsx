import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import {
  cycles,
  programState,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import { weightFromRmrefPercent } from "@/lib/program/rmref";
import { getLastSetsByExerciseNames } from "@/app/actions/workout";
import { BottomNav } from "@/components/bottom-nav";
import { StartWorkoutButton } from "@/components/start-workout-button";
import { ExerciseGuideButton } from "@/components/exercise-guide-sheet";
import { ProgramNotes } from "@/components/program-notes";
import { ArrowLeft, Bike, Heart, History, Timer } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtRest(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} мин ${s} с` : `${m} мин`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-pretty font-mono text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workoutId = Number.parseInt(id, 10);
  if (Number.isNaN(workoutId)) notFound();

  await ensureSchema();

  const [workout] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1);
  if (!workout) notFound();

  const [[cycle], exercises, active, stateRows] = await Promise.all([
    db.select().from(cycles).where(eq(cycles.id, workout.cycleId)).limit(1),
    db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .orderBy(asc(workoutExercises.sortOrder)),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "active"))
      .limit(1),
    db
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1),
  ]);

  const lastByName =
    workout.kind !== "cardio" && exercises.length > 0
      ? await getLastSetsByExerciseNames(exercises.map((e) => e.name))
      : {};
  const first = exercises[0];
  const firstLast = first ? (lastByName[first.name] ?? []) : [];
  const restExercises = exercises.slice(1);
  const testBranches = Array.isArray(workout.branches)
    ? (workout.branches as Array<{ id?: string; name?: string; default?: boolean }>)
        .filter(
          (branch): branch is { id: string; name: string; default?: boolean } =>
            typeof branch.id === "string" && typeof branch.name === "string",
        )
    : [];
  const rmrefKg = Number(stateRows[0]?.rmrefKg ?? 115);
  const displayWeight = (exercise: (typeof exercises)[number]) => {
    const min = exercise.pctMin != null ? Number(exercise.pctMin) : null;
    const max = exercise.pctMax != null ? Number(exercise.pctMax) : null;
    if (min == null && max == null) return exercise.weightText;
    const minKg = min == null ? null : weightFromRmrefPercent(rmrefKg, min);
    const maxKg = max == null ? null : weightFromRmrefPercent(rmrefKg, max);
    const pct = min === max ? `${min}%` : `${min ?? "?"}–${max ?? "?"}%`;
    const kg = minKg === maxKg ? `${minKg}` : `${minKg ?? "?"}–${maxKg ?? "?"}`;
    return `${pct} RMref · ${kg} кг`;
  };

  return (
    <div className="min-h-screen bg-background pb-56">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-4">
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Программа
          </Link>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Цикл {cycle?.number} · {cycle?.name}
          </p>
          <h1 className="mt-1 text-balance text-xl font-bold tracking-tight">
            {workout.title}
          </h1>
          {workout.notes && (
            <ProgramNotes text={workout.notes} compact />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        {workout.kind === "cardio" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bike className="size-7" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {workout.cardioMinutes && workout.cardioMinutes !== "—"
                    ? `${workout.cardioMinutes} мин`
                    : "По плану"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Зона {workout.cardioZone ?? "Z2"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <Heart
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Подключите пульс с часов HUAWEI WATCH GT 5 PRO (на часах:
                тренировка → Трансляция пульса). Приложение покажет вашу зону и
                подаст сигнал, если выйдете за её пределы.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <Timer
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Секундомер фиксирует длительность, а после завершения средний
                пульс и время сохранятся в историю.
              </p>
            </div>
            {cycle?.notes && (
              <ProgramNotes text={cycle.notes} label="План цикла" />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {first ? (
              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-4">
                  <p className="font-mono text-xs uppercase tracking-widest text-primary">
                    Упражнение 1 из {exercises.length}
                  </p>
                  <div className="mt-1 flex items-start gap-2">
                    <h2 className="min-w-0 flex-1 text-balance text-2xl font-bold leading-tight">
                      {first.name}
                    </h2>
                    <ExerciseGuideButton exerciseName={first.name} />
                  </div>
                  {(first.weightText ||
                    first.targetReps ||
                    first.targetSets ||
                    first.tempo ||
                    first.restSeconds ||
                    first.targetRirMin != null ||
                    first.targetRpeMin != null) && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                      {first.weightText && (
                        <Stat label="Вес" value={displayWeight(first) ?? first.weightText} />
                      )}
                      {first.targetReps && (
                        <Stat label="Повторения" value={first.targetReps} />
                      )}
                      {first.targetSets && (
                        <Stat label="Подходы" value={first.targetSets} />
                      )}
                      {first.tempo && <Stat label="Темп" value={first.tempo} />}
                      {first.restSeconds ? (
                        <Stat
                          label="Отдых"
                          value={fmtRest(first.restSeconds)}
                        />
                      ) : null}
                      {first.targetRirMin != null && (
                        <Stat
                          label="RIR"
                          value={
                            first.targetRirMin === first.targetRirMax
                              ? String(first.targetRirMin)
                              : `${first.targetRirMin}–${first.targetRirMax}`
                          }
                        />
                      )}
                      {first.targetRpeMin != null && (
                        <Stat
                          label="RPE"
                          value={
                            first.targetRpeMin === first.targetRpeMax
                              ? String(first.targetRpeMin)
                              : `${first.targetRpeMin}–${first.targetRpeMax}`
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="px-4 py-3">
                  {first.comment && (
                    <p className="mb-3 rounded-md bg-secondary px-3 py-2 text-sm leading-relaxed text-secondary-foreground">
                      {first.comment}
                    </p>
                  )}
                  <div className="rounded-md border border-border px-3 py-2">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <History className="size-3.5 shrink-0" />
                      Прошлое выполнение
                    </p>
                    {firstLast.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {firstLast.map((s, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              #{i + 1}
                            </span>
                            <span className="font-medium">
                              {s.weight != null ? `${s.weight} кг` : "—"} ×{" "}
                              {s.reps ?? "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              RIR {s.rir ?? "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Первая тренировка с этим упражнением
                      </p>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                В этой тренировке пока нет упражнений.
              </p>
            )}

            {restExercises.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Далее в тренировке
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    ещё {restExercises.length}
                  </span>
                </div>
                <ol className="flex flex-col gap-2.5">
                  {restExercises.map((ex, i) => {
                    const hasCompactPrescription =
                      Boolean(ex.targetSets) &&
                      Boolean(ex.targetReps) &&
                      (ex.targetReps?.length ?? 0) <= 18;

                    return (
                      <li
                        key={ex.id}
                        className="overflow-hidden rounded-xl border border-border bg-card"
                      >
                        <div className="flex items-start gap-3 px-4 py-3.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold text-muted-foreground">
                            {i + 2}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-pretty font-semibold leading-snug">
                                {ex.name}
                              </p>
                              {hasCompactPrescription && (
                                <span className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-xs font-semibold text-secondary-foreground">
                                  {ex.targetSets} × {ex.targetReps}
                                </span>
                              )}
                            </div>

                            {ex.weightText && (
                              <p className="mt-1 font-mono text-sm font-semibold leading-relaxed text-primary">
                                {displayWeight(ex) ?? ex.weightText}
                              </p>
                            )}

                            {!hasCompactPrescription && ex.targetReps && (
                              <div className="mt-2 rounded-lg bg-secondary/65 px-3 py-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Выполнение
                                </p>
                                <p className="mt-0.5 text-pretty text-sm leading-relaxed text-secondary-foreground">
                                  {ex.targetReps}
                                </p>
                              </div>
                            )}

                            {ex.comment && (
                              <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
                                {ex.comment}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {cycle?.notes && (
              <ProgramNotes text={cycle.notes} label="План цикла" />
            )}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-32 z-[60]">
        <div className="mx-auto max-w-lg px-4 pb-2">
          <StartWorkoutButton
            workoutId={workoutId}
            workoutKind={workout.kind}
            hasActive={active.length > 0}
            activeSessionId={active[0]?.id}
            testBranches={testBranches}
          />
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
