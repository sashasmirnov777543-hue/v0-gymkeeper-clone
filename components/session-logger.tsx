"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  History,
  Minus,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseGuideButton } from "@/components/exercise-guide-sheet";
import { ExerciseHistory } from "@/components/exercise-history";
import { HeartRateBadge } from "@/components/heart-rate";
import { RestTimer } from "@/components/rest-timer";
import {
  suggestCalibrationTripleWeight,
  type WarmupFeel,
} from "@/lib/program/rmref";
import { SessionNotes } from "@/components/session-notes";
import { SingleGate } from "@/components/single-gate";
import {
  DEFAULT_CLEARANCE_LEVEL,
  type ClearanceLevel,
} from "@/lib/program/version";
import { useWakeLock } from "@/lib/heart-rate";
import { unlockAudio } from "@/lib/sound";
import {
  cancelSession,
  deleteSet,
  finishSession,
  logSet,
  updateSet,
} from "@/app/actions/workout";
import {
  cancelLocalSession,
  finishLocalSession,
  pushOp,
  removeQueuedLocalSet,
  replaceQueuedLocalSet,
  saveLocalSets,
} from "@/lib/offline";
import {
  isPercentPrescribed,
  parsePrescribedWeight,
  recommendWeight,
  type LoggedSetLite,
  type Recommendation,
} from "@/lib/recommend";
import {
  decideTechnicalStop,
  type TechnicalSign,
} from "@/lib/technical-stop";

export type SessionExercise = {
  id: number;
  name: string;
  weightText: string | null;
  targetReps: string | null;
  targetSets: string | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRpeMin?: number | null;
  targetRpeMax?: number | null;
  role?: string;
  isOptional?: boolean;
  condition?: string | null;
  comment: string | null;
  restSeconds: number | null;
  tempo?: string | null;
};

export type SessionSetRow = {
  id: number;
  workoutExerciseId: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
  velocity?: string | null;
  stickingPoint?: string | null;
  isWarmup?: boolean;
  pauseQuality?: string | null;
  touchPoint?: string | null;
  trajectoryQuality?: string | null;
  techniqueSigns?: unknown;
  painScore?: number | null;
  symptoms?: unknown;
  videoUrl?: string | null;
};

type SetDraft = {
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  velocity: "fast" | "normal" | "slow";
  stickingPoint: "chest" | "middle" | "lockout" | null;
  isWarmup: boolean;
  pauseQuality: "clean" | "short" | "lost" | null;
  touchPoint: "stable" | "high" | "low" | "variable" | null;
  trajectoryQuality: "clean" | "asymmetric" | "deviated" | null;
  techniqueSigns: TechnicalSign[];
  painScore: number | null;
  painChangesMovement: boolean;
  medicalSymptom: boolean;
  unsafeLossOfControl: boolean;
  videoUrl: string | null;
};

function fmtRest(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`;
}

function parseFirstInt(text: string | null): number | null {
  const match = text?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function isBenchExercise(exercise: SessionExercise) {
  return /жим|bench|spoto/i.test(`${exercise.name} ${exercise.role ?? ""}`);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-pretty font-mono text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function SessionLogger({
  session,
  workout,
  cycle,
  exercises,
  initialSets,
  lastSetsByName,
  offlineKey,
  clearanceLevel = DEFAULT_CLEARANCE_LEVEL,
  rmrefKg = 115,
  lastStandardTriple = null,
}: {
  session: {
    id: number;
    status: string;
    startedAt: string;
    notes?: string | null;
    readinessLevel?: string | null;
    readinessReasons?: unknown;
    adaptationPlan?: unknown;
    safetyStopped?: boolean;
  };
  workout: { id: number; title: string; slot?: string; branches?: unknown };
  cycle: { number: number; name: string; block: string };
  exercises: SessionExercise[];
  initialSets: SessionSetRow[];
  lastSetsByName: Record<string, LoggedSetLite[]>;
  offlineKey?: string;
  /** Уровень допуска редакции 2.0; определяет доступность условных синглов. */
  clearanceLevel?: ClearanceLevel;
  /** Текущий RMref — основа подсказки веса первой стандартизированной тройки. */
  rmrefKg?: number;
  /** Последняя выполненная калибровочная или тестовая тройка. */
  lastStandardTriple?: { weightKg: number; rpe: number | null } | null;
}) {
  const router = useRouter();
  const [sets, setSets] = useState<SessionSetRow[]>(initialSets);
  const [index, setIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [rest, setRest] = useState<{
    seconds: number;
    label: string;
    recommendation: Recommendation;
  } | null>(null);
  const readOnly = session.status !== "active";
  useWakeLock(!readOnly);
  const sessionRef: number | string = offlineKey ?? session.id;

  const persistLocal = (next: SessionSetRow[]) => {
    if (offlineKey) saveLocalSets(offlineKey, next);
  };

  function handleFinish() {
    if (offlineKey) {
      finishLocalSession(offlineKey);
      router.push("/history");
      return;
    }
    startTransition(async () => {
      try {
        await finishSession(session.id);
      } catch (error) {
        if (isOffline(error)) {
          pushOp({
            kind: "finish",
            sessionRef,
            finishedAt: new Date().toISOString(),
          });
          router.push("/history");
        } else {
          throw error;
        }
      }
    });
  }

  function handleCancel() {
    if (offlineKey) {
      cancelLocalSession(offlineKey);
      router.push("/");
      return;
    }
    startTransition(async () => {
      try {
        await cancelSession(session.id);
      } catch (error) {
        if (isOffline(error)) {
          pushOp({ kind: "cancel", sessionRef });
          router.push("/");
        } else {
          throw error;
        }
      }
    });
  }

  const setsByExercise = useMemo(() => {
    const map: Record<number, SessionSetRow[]> = {};
    for (const set of sets) (map[set.workoutExerciseId] ??= []).push(set);
    return map;
  }, [sets]);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(0, exercises.length - 1));
  const current = exercises[safeIndex];
  const isFirst = safeIndex === 0;
  const isLast = safeIndex >= exercises.length - 1;
  const goPrevious = () => setIndex((value) => Math.max(0, value - 1));
  const goNext = () => setIndex((value) => Math.min(exercises.length - 1, value + 1));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-52">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href={`/workout/${workout.id}`} className="grid size-9 place-items-center rounded-md text-muted-foreground" aria-label="Назад">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{cycle.block.toUpperCase()} · цикл {cycle.number} · {workout.slot ?? ""}</p>
            <h1 className="truncate text-base font-semibold">{workout.title}</h1>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{sets.length} подх.</span>
          <HeartRateBadge />
        </div>
        {exercises.length > 1 && (
          <div className="mt-2 flex items-center gap-1" aria-hidden="true">
            {exercises.map((exercise, position) => (
              <span key={exercise.id} className={`h-1.5 flex-1 rounded-full ${position === safeIndex ? "bg-primary" : (setsByExercise[exercise.id]?.length ?? 0) > 0 ? "bg-primary/40" : "bg-secondary"}`} />
            ))}
          </div>
        )}
      </header>

      {session.readinessLevel && (
        <section className={`mx-4 mt-3 rounded-xl border p-4 readiness-${session.readinessLevel}`}>
          <strong>Готовность: {readinessName(session.readinessLevel)}</strong>
          <p className="mt-1 text-sm text-muted-foreground">{readinessAction(session.readinessLevel)}</p>
        </section>
      )}

      {current ? (
        <CurrentExercise
          key={current.id}
          exercise={current}
          position={safeIndex + 1}
          total={exercises.length}
          doneSets={setsByExercise[current.id] ?? []}
          lastTimeSets={lastSetsByName[current.name] ?? []}
          rmrefKg={rmrefKg}
          lastStandardTriple={lastStandardTriple}
          readOnly={readOnly}
          sessionRef={sessionRef}
          offline={Boolean(offlineKey)}
          readinessLevel={session.readinessLevel}
          clearanceLevel={clearanceLevel}
          sessionSafetyStopped={session.safetyStopped === true}
          onLogged={(row) =>
            setSets((previous) => {
              const next = [...previous, row];
              persistLocal(next);
              return next;
            })
          }
          onReplaceId={(temporaryId, realId) =>
            setSets((previous) =>
              previous.map((set) =>
                set.id === temporaryId ? { ...set, id: realId } : set,
              ),
            )
          }
          onDeleted={(setId) =>
            setSets((previous) => {
              const next = previous.filter((set) => set.id !== setId);
              persistLocal(next);
              return next;
            })
          }
          onUpdated={(setId, values) =>
            setSets((previous) => {
              const next = previous.map((set) =>
                set.id === setId ? { ...set, ...values } : set,
              );
              persistLocal(next);
              return next;
            })
          }
          onRest={(seconds, label, recommendation) =>
            setRest({ seconds, label, recommendation })
          }
          onAdvance={isLast ? undefined : goNext}
        />
      ) : (
        <div className="mx-4 mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm">
          <strong>Силовая часть недоступна.</strong>
          <p className="mt-1 text-muted-foreground">
            {session.readinessLevel === "red"
              ? "Красный статус блокирует тренировку и разминку."
              : "В этой сессии нет доступных упражнений."}
          </p>
        </div>
      )}

      {!offlineKey && isLast && (
        <div className="px-4 pb-2">
          <SessionNotes sessionId={session.id} initialNotes={session.notes ?? null} readOnly={readOnly} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-lg px-4 py-3">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent" disabled={isFirst || exercises.length === 0} onClick={goPrevious}>
              <ArrowLeft className="size-4" /> Назад
            </Button>
            {readOnly ? (
              <Button render={<Link href="/history" />} className="flex-[2]"><History className="size-4" /> К истории</Button>
            ) : isLast ? (
              <Button className="flex-[2]" disabled={isPending || sets.length === 0 || session.readinessLevel === "red"} onClick={handleFinish}>
                <Check className="size-4" /> Завершить
              </Button>
            ) : (
              <Button className="flex-[2]" onClick={goNext}>Следующее <ArrowRight className="size-4" /></Button>
            )}
          </div>
          {!readOnly && (
            <button type="button" disabled={isPending} onClick={() => confirm("Отменить тренировку? Записанные подходы будут удалены.") && handleCancel()} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-destructive">
              Отменить тренировку
            </button>
          )}
        </div>
      </div>

      {rest && (
        <RestTimer seconds={rest.seconds} label={rest.label} recommendation={rest.recommendation} onClose={() => setRest(null)} />
      )}
    </main>
  );
}

function CurrentExercise({
  exercise,
  position,
  total,
  doneSets,
  lastTimeSets,
  rmrefKg,
  lastStandardTriple,
  readOnly,
  sessionRef,
  offline,
  readinessLevel,
  clearanceLevel,
  sessionSafetyStopped,
  onLogged,
  onReplaceId,
  onDeleted,
  onUpdated,
  onRest,
  onAdvance,
}: {
  exercise: SessionExercise;
  position: number;
  total: number;
  doneSets: SessionSetRow[];
  lastTimeSets: LoggedSetLite[];
  rmrefKg: number;
  lastStandardTriple: { weightKg: number; rpe: number | null } | null;
  readOnly: boolean;
  sessionRef: number | string;
  offline: boolean;
  readinessLevel?: string | null;
  clearanceLevel: ClearanceLevel;
  sessionSafetyStopped: boolean;
  onLogged: (row: SessionSetRow) => void;
  onReplaceId: (temporaryId: number, realId: number) => void;
  onDeleted: (setId: number) => void;
  onUpdated: (setId: number, values: Partial<SessionSetRow>) => void;
  onRest: (seconds: number, label: string, recommendation: Recommendation) => void;
  onAdvance?: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [singleAllowed, setSingleAllowed] = useState(false);
  const conditionalSingle = Boolean(
    exercise.isOptional &&
      exercise.targetReps === "1" &&
      (exercise.role?.includes("conditional") || exercise.role?.includes("single_rehearsal")),
  );
  const prescribed = parsePrescribedWeight(exercise.weightText);
  const fixedLoad = isPercentPrescribed(exercise.weightText);
  const recommendation = useMemo(() => {
    const current = doneSets.map((set) => ({
      weight: set.weight,
      reps: set.reps,
      rir: set.rir,
    }));
    const source = current.some((set) => set.rir != null && set.weight != null)
      ? current
      : lastTimeSets;
    return recommendWeight(
      source,
      exercise.targetRirMin,
      exercise.targetRirMax,
      prescribed,
      { fixedLoad },
    );
  }, [doneSets, exercise.targetRirMax, exercise.targetRirMin, fixedLoad, lastTimeSets, prescribed]);

  const latest = doneSets.at(-1);
  const latestSigns = Array.isArray(latest?.techniqueSigns)
    ? (latest.techniqueSigns.filter((sign): sign is TechnicalSign =>
        ["pause_or_touch_lost", "asymmetry", "unexpected_slowdown", "hips_lifted", "grinder"].includes(String(sign)),
      ) as TechnicalSign[])
    : [];
  const technicalEvents = doneSets.filter(
    (set) => Array.isArray(set.techniqueSigns) && set.techniqueSigns.length > 0,
  ).length;
  const technicalDecision = decideTechnicalStop({
    medicalSymptom:
      Array.isArray(latest?.symptoms) && latest.symptoms.includes("medical_symptom"),
    painChangesMovement:
      Array.isArray(latest?.symptoms) && latest.symptoms.includes("pain_changes_movement"),
    unsafeLossOfControl:
      Array.isArray(latest?.symptoms) && latest.symptoms.includes("unsafe_loss_of_control"),
    signs: latestSigns,
    rpeAboveTargetByOne:
      latest?.rpe != null &&
      exercise.targetRpeMax != null &&
      latest.rpe >= exercise.targetRpeMax + 1,
    repeatedAfterReduction: technicalEvents >= 2,
  });
  const loggingBlocked =
    sessionSafetyStopped ||
    technicalDecision.action === "stop_all" ||
    technicalDecision.action === "stop_primary" ||
    (conditionalSingle && !singleAllowed);
  // Стандартизированная тройка не имеет процента от RMref: её вес подбирается.
  // Считаем подсказку сами, чтобы не оставлять поле пустым.
  const isStandardTriple =
    exercise.role === "calibration" || exercise.role === "test_triple";
  const [warmupFeel, setWarmupFeel] = useState<WarmupFeel>("normal");
  const calibrationSuggestion = isStandardTriple
    ? suggestCalibrationTripleWeight({
        rmrefKg,
        previous: lastStandardTriple
          ? { weightKg: lastStandardTriple.weightKg, rpe: lastStandardTriple.rpe }
          : null,
        warmupFeel,
      })
    : null;

  const targetSets = parseFirstInt(exercise.targetSets);
  const allSetsDone = targetSets != null && doneSets.length >= targetSets;
  const hasTargets = Boolean(exercise.weightText || exercise.targetReps);

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Упражнение {position} из {total}</p>
          <div className="mt-1 flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-balance text-2xl font-bold leading-tight">{exercise.name}</h2>
            <ExerciseGuideButton exerciseName={exercise.name} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {exercise.weightText && <Stat label="Вес" value={exercise.weightText} />}
            {exercise.targetSets && <Stat label="Подходы" value={exercise.targetSets} />}
            {exercise.targetReps && <Stat label="Повторения" value={exercise.targetReps} />}
            {exercise.targetRpeMin != null && (
              <Stat label="RPE" value={exercise.targetRpeMin === exercise.targetRpeMax ? String(exercise.targetRpeMin) : `${exercise.targetRpeMin}–${exercise.targetRpeMax ?? "?"}`} />
            )}
            {exercise.targetRirMin != null && (
              <Stat label="RIR" value={exercise.targetRirMin === exercise.targetRirMax ? String(exercise.targetRirMin) : `${exercise.targetRirMin}–${exercise.targetRirMax ?? "?"}`} />
            )}
            {exercise.restSeconds ? <Stat label="Отдых" value={fmtRest(exercise.restSeconds)} /> : null}
          </div>
        </div>
        <div className="space-y-3 px-4 py-3">
          {exercise.isOptional && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">Условный/опциональный элемент: при сомнении пропустить без компенсации.</p>
          )}
          {(exercise.condition || exercise.comment) && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm leading-relaxed text-secondary-foreground">{exercise.condition ?? exercise.comment}</p>
          )}
          {lastTimeSets.length > 0 && (
            <div className="rounded-md border border-border px-3 py-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><History className="size-3.5" /> Прошлое выполнение</p>
              <p className="font-mono text-xs text-muted-foreground">
                {lastTimeSets.map((set) => `${set.weight ?? "—"}×${set.reps ?? "—"} RIR${set.rir ?? "—"}`).join(" · ")}
              </p>
            </div>
          )}
        </div>
      </section>

      {conditionalSingle && (
        <SingleGate
          sessionId={typeof sessionRef === "number" ? sessionRef : 0}
          offline={offline || typeof sessionRef === "string"}
          clearanceLevel={clearanceLevel}
          onDecision={setSingleAllowed}
        />
      )}

      {recommendation && hasTargets && !conditionalSingle && (
        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${recommendation.direction === "down" ? "bg-warning/15 text-warning" : recommendation.direction === "up" ? "bg-success/15 text-success" : "bg-secondary"}`}>
          {recommendation.direction === "down" ? <TrendingDown className="size-4" /> : recommendation.direction === "up" ? <TrendingUp className="size-4" /> : <Check className="size-4" />}
          <span><strong>{recommendation.weight} кг</strong> — {recommendation.reason}</span>
        </div>
      )}

      {sessionSafetyStopped && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <strong>Сессия остановлена защитным правилом.</strong>
          <p className="mt-1 text-muted-foreground">Новые подходы заблокированы. Не компенсируйте пропущенную работу.</p>
        </div>
      )}

      {technicalDecision.action !== "continue" && (
        <div className={`rounded-xl border p-4 text-sm ${technicalDecision.action === "reduce" ? "border-warning/40 bg-warning/10" : "border-destructive/40 bg-destructive/10"}`}>
          <strong>{technicalDecision.action === "reduce" ? "Снизить нагрузку" : "Стоп жимовой работы"}</strong>
          <p className="mt-1 text-muted-foreground">
            {technicalDecision.action === "reduce"
              ? "Снизьте вес на 2,5–5% и/или уберите один рабочий сет."
              : "Завершите основной жим; вторичную жимовую работу не выполнять. Ничего не компенсировать."}
          </p>
        </div>
      )}

      {doneSets.length > 0 && (
        <section>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Выполнено{targetSets != null ? ` · ${doneSets.length} из ${targetSets}` : ""}</p>
          <ul className="space-y-2">
            {doneSets.map((set, setIndex) => (
              <li key={set.id} className="rounded-lg bg-secondary px-3 py-2 text-sm">
                {editingId === set.id ? (
                  <EditSetForm
                    set={set}
                    onCancel={() => setEditingId(null)}
                    onSave={(values) => {
                      setEditingId(null);
                      onUpdated(set.id, values);
                      if (set.id < 0 || offline || typeof sessionRef === "string") {
                        replaceQueuedLocalSet(
                          sessionRef,
                          set.workoutExerciseId,
                          set.setNumber,
                          values,
                        );
                      } else if (typeof sessionRef === "number") {
                        updateSet({ setId: set.id, sessionId: sessionRef, ...values }).catch(
                          (error) => {
                            if (isOffline(error)) {
                              pushOp({
                                kind: "updateSet",
                                sessionRef,
                                setId: set.id,
                                ...values,
                              });
                            }
                          },
                        );
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{setIndex + 1}</span>
                    <span className="flex-1 font-medium">{set.weight ?? "—"} кг × {set.reps ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">RPE {set.rpe ?? "—"} · RIR {set.rir ?? "—"}</span>
                    {!readOnly && (
                      <>
                        <button type="button" onClick={() => setEditingId(set.id)} className="grid size-8 place-items-center text-muted-foreground" aria-label="Редактировать"><Pencil className="size-3.5" /></button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Удалить подход ${setIndex + 1}?`)) return;
                            onDeleted(set.id);
                            if (set.id < 0 || offline || typeof sessionRef === "string") {
                              removeQueuedLocalSet(
                                sessionRef,
                                set.workoutExerciseId,
                                set.setNumber,
                              );
                            } else if (typeof sessionRef === "number") {
                              deleteSet(set.id, sessionRef).catch((error) => {
                                if (isOffline(error)) pushOp({ kind: "deleteSet", setId: set.id });
                              });
                            }
                          }}
                          className="grid size-8 place-items-center text-muted-foreground hover:text-destructive"
                          aria-label="Удалить"
                        ><Trash2 className="size-4" /></button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasTargets && !offline && <ExerciseHistory exerciseName={exercise.name} />}

      {!readOnly && !loggingBlocked && calibrationSuggestion && (
        <section className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Подсказка веса</p>
          <p className="mt-1 font-mono text-2xl font-bold">{calibrationSuggestion.weightKg} кг</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {calibrationSuggestion.explanation}. Вес уже подставлен в поле ниже — поправьте, если разминка
            говорит другое.
          </p>
          <fieldset className="mt-3">
            <legend className="text-xs text-muted-foreground">Как прошла разминка</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {([
                ["easy", "Легко"],
                ["normal", "Обычно"],
                ["hard", "Тяжело"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWarmupFeel(value)}
                  className={`min-h-11 rounded-md border text-xs font-semibold ${warmupFeel === value ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {!readOnly && !loggingBlocked && (
        <SetForm
          key={`${doneSets.length}:${calibrationSuggestion?.weightKg ?? ""}`}
          bench={isBenchExercise(exercise)}
          defaultWeight={calibrationSuggestion?.weightKg ?? recommendation?.weight ?? prescribed}
          targetRirMin={exercise.targetRirMin}
          targetRpeMax={exercise.targetRpeMax ?? null}
          targetReps={exercise.targetReps}
          onSubmit={async (draft) => {
            const temporaryId = -Date.now();
            const setNumber = doneSets.length + 1;
            const symptoms = [
              ...(draft.medicalSymptom ? ["medical_symptom"] : []),
              ...(draft.painChangesMovement ? ["pain_changes_movement"] : []),
              ...(draft.unsafeLossOfControl ? ["unsafe_loss_of_control"] : []),
            ];
            const row: SessionSetRow = {
              id: temporaryId,
              workoutExerciseId: exercise.id,
              setNumber,
              ...draft,
              symptoms,
            };
            onLogged(row);
            // Последний плановый подход упражнения — сами открываем следующее.
            // Задержка даёт увидеть, что подход записан; таймер отдыха идёт поверх.
            if (targetSets != null && setNumber >= targetSets && onAdvance) {
              setTimeout(onAdvance, 900);
            }
            if (exercise.restSeconds && exercise.restSeconds > 0) {
              const nextRecommendation = recommendWeight(
                [...doneSets.map((set) => ({ weight: set.weight, reps: set.reps, rir: set.rir })), draft],
                exercise.targetRirMin,
                exercise.targetRirMax,
                prescribed,
                { fixedLoad },
              );
              onRest(exercise.restSeconds, `Отдых · ${exercise.name}`, nextRecommendation);
            }
            const payload = {
              sessionRef,
              workoutExerciseId: exercise.id,
              setNumber,
              weight: draft.weight,
              reps: draft.reps,
              rir: draft.rir,
              rpe: draft.rpe,
              velocity: draft.velocity,
              stickingPoint: draft.stickingPoint,
              isWarmup: draft.isWarmup,
              pauseQuality: draft.pauseQuality,
              touchPoint: draft.touchPoint,
              trajectoryQuality: draft.trajectoryQuality,
              techniqueSigns: draft.techniqueSigns,
              painScore: draft.painScore,
              symptoms,
              videoUrl: draft.videoUrl,
            } as const;
            if (offline || typeof sessionRef === "string") {
              pushOp({ kind: "set", ...payload });
              return;
            }
            try {
              const inserted = await logSet({ sessionId: sessionRef, ...payload });
              onReplaceId(temporaryId, inserted.id);
            } catch (error) {
              if (isOffline(error)) pushOp({ kind: "set", ...payload });
              else throw error;
            }
          }}
        />
      )}

      {!readOnly && loggingBlocked && conditionalSingle && !singleAllowed && onAdvance && (
        <Button variant="outline" className="h-11 w-full bg-transparent" onClick={onAdvance}>
          Пропустить без компенсации <ArrowRight className="size-4" />
        </Button>
      )}
      {!readOnly && onAdvance && doneSets.length > 0 && (
        <Button variant={allSetsDone ? "default" : "outline"} className="h-11 w-full" onClick={onAdvance}>
          Закончить упражнение · следующее <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}

function SetForm({
  bench,
  defaultWeight,
  targetRirMin,
  targetRpeMax,
  targetReps,
  onSubmit,
}: {
  bench: boolean;
  defaultWeight: number | null;
  targetRirMin: number | null;
  targetRpeMax: number | null;
  targetReps: string | null;
  onSubmit: (draft: SetDraft) => Promise<void>;
}) {
  const [weight, setWeight] = useState(defaultWeight != null ? String(defaultWeight) : "");
  // Повторы предзаполняются из цели: для точного числа — им, для диапазона — нижней
  // границей (верх диапазона надо заработать). Фишки рядом позволяют поправить в один тап.
  const [reps, setReps] = useState(() => {
    const nums = (targetReps ?? "").match(/\d+/g)?.map(Number) ?? [];
    return nums.length ? String(Math.min(...nums)) : "";
  });
  const [rir, setRir] = useState<number | null>(targetRirMin);
  const [rpe, setRpe] = useState<number | null>(targetRpeMax);
  const [velocity, setVelocity] = useState<"fast" | "normal" | "slow">("normal");
  const [stickingPoint, setStickingPoint] = useState<"chest" | "middle" | "lockout" | null>(null);
  const [isWarmup, setIsWarmup] = useState(false);
  const [pauseQuality, setPauseQuality] = useState<SetDraft["pauseQuality"]>(bench ? "clean" : null);
  const [touchPoint, setTouchPoint] = useState<SetDraft["touchPoint"]>(bench ? "stable" : null);
  const [trajectoryQuality, setTrajectoryQuality] = useState<SetDraft["trajectoryQuality"]>(bench ? "clean" : null);
  const [techniqueSigns, setTechniqueSigns] = useState<TechnicalSign[]>([]);
  const [painScore, setPainScore] = useState<number | null>(0);
  const [painChangesMovement, setPainChangesMovement] = useState(false);
  const [medicalSymptom, setMedicalSymptom] = useState(false);
  const [unsafeLossOfControl, setUnsafeLossOfControl] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const bump = (delta: number) => {
    const current = Number.parseFloat(weight.replace(",", ".")) || 0;
    setWeight(String(Math.max(0, Math.round((current + delta) * 10) / 10)));
  };
  const toggleSign = (sign: TechnicalSign) =>
    setTechniqueSigns((current) =>
      current.includes(sign) ? current.filter((item) => item !== sign) : [...current, sign],
    );
  const repChips = (() => {
  const nums = (targetReps ?? "").match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return [];
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const chips: number[] = [];
  for (let n = Math.max(1, lo - 1); n <= hi + 1 && chips.length < 7; n += 1) chips.push(n);
  return chips;
})();

  // Быстрая запись возможна, когда повторы уже заданы: тогда касание по шкале
  // усилия само сохраняет подход и запускает отдых.
  const canQuickSave = reps.trim() !== "" && !saving;

  async function commit(effort?: { rpe?: number | null; rir?: number | null }) {
    unlockAudio();
    setSaving(true);
    try {
      const parsedWeight = weight.trim() ? Number.parseFloat(weight.replace(",", ".")) : null;
      const parsedReps = reps.trim() ? Number.parseInt(reps, 10) : null;
      await onSubmit({
        weight: Number.isNaN(parsedWeight as number) ? null : parsedWeight,
        reps: Number.isNaN(parsedReps as number) ? null : parsedReps,
        rir: effort && "rir" in effort ? (effort.rir ?? null) : rir,
        rpe: effort && "rpe" in effort ? (effort.rpe ?? null) : rpe,
        velocity,
        stickingPoint,
        isWarmup,
        pauseQuality,
        touchPoint,
        trajectoryQuality,
        techniqueSigns,
        painScore,
        painChangesMovement,
        medicalSymptom,
        unsafeLossOfControl,
        videoUrl: videoUrl.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await commit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">Вес, кг
          <div className="mt-1 flex gap-1.5">
            <button type="button" onClick={() => bump(-2.5)} className="grid size-10 shrink-0 place-items-center rounded-md border border-border"><Minus className="size-4" /></button>
            <input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-center text-base font-semibold" />
            <button type="button" onClick={() => bump(2.5)} className="grid size-10 shrink-0 place-items-center rounded-md border border-border"><Plus className="size-4" /></button>
          </div>
        </label>
        <label className="text-xs text-muted-foreground">Повторения
          <input inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-transparent px-2 text-center text-base font-semibold" />
        </label>
      </div>
      {repChips.length > 0 && (
  <div className="flex flex-wrap gap-1.5">
    {repChips.map((n) => (
      <button key={n} type="button" onClick={() => setReps(String(n))} className={`min-h-9 min-w-10 flex-1 rounded-md border px-2 text-xs font-semibold ${reps === String(n) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{n}</button>
    ))}
  </div>
)}

      {(bench || targetRpeMax != null) && (
        <ScaleButtons
          label={canQuickSave ? "Фактический RPE — касание записывает подход" : "Фактический RPE"}
          values={[5, 6, 6.5, 7, 7.5, 8, 9, 10]}
          selected={rpe}
          set={setRpe}
          quickSave={canQuickSave ? (value) => { setRpe(value); void commit({ rpe: value }); } : undefined}
        />
      )}
      <ScaleButtons
        label={
          canQuickSave && !(bench || targetRpeMax != null)
            ? "Фактический RIR — касание записывает подход"
            : "Фактический RIR"
        }
        values={[0, 1, 2, 3, 4, 5]}
        selected={rir}
        set={setRir}
        quickSave={
          canQuickSave && !(bench || targetRpeMax != null)
            ? (value) => { setRir(value); void commit({ rir: value }); }
            : undefined
        }
      />

      {bench && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Пауза" value={pauseQuality ?? ""} set={(value) => setPauseQuality((value || null) as SetDraft["pauseQuality"])} options={[["clean", "Чистая"], ["short", "Короткая"], ["lost", "Потеряна"]]} />
          <SelectField label="Точка касания" value={touchPoint ?? ""} set={(value) => setTouchPoint((value || null) as SetDraft["touchPoint"])} options={[["stable", "Стабильна"], ["high", "Выше"], ["low", "Ниже"], ["variable", "Плавает"]]} />
          <SelectField label="Траектория" value={trajectoryQuality ?? ""} set={(value) => setTrajectoryQuality((value || null) as SetDraft["trajectoryQuality"])} options={[["clean", "Чистая"], ["asymmetric", "Асимметрия"], ["deviated", "Отклонение"]]} />
        </div>
      )}
     {bench && (
      <fieldset>
        <legend className="text-xs font-medium text-muted-foreground">Технические признаки</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([
            ["pause_or_touch_lost", "Потеря паузы/касания"],
            ["asymmetry", "Асимметрия"],
            ["unexpected_slowdown", "Неожиданное замедление"],
            ["hips_lifted", "Отрыв таза"],
            ["grinder", "Выраженный гриндер"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => toggleSign(value)} className={`min-h-10 rounded-lg border px-2 text-xs ${techniqueSigns.includes(value) ? "border-warning bg-warning/15" : "border-border"}`}>{label}</button>
          ))}
        </div>
      </fieldset>
      )}
      <label className="block text-xs text-muted-foreground">Боль: {painScore ?? 0}/10
        <input type="range" min="0" max="10" value={painScore ?? 0} onChange={(event) => setPainScore(Number(event.target.value))} className="mt-2 w-full" />
      </label>
      <div className="space-y-1 rounded-lg border border-destructive/30 p-3">
        <CheckRow label="Боль меняет движение" checked={painChangesMovement} set={setPainChangesMovement} />
        <CheckRow label="Появился медицинский симптом" checked={medicalSymptom} set={setMedicalSymptom} />
        <CheckRow label="Опасная потеря контроля" checked={unsafeLossOfControl} set={setUnsafeLossOfControl} />
      </div>
      <label className="block text-xs text-muted-foreground">Видео/ссылка (опционально)
        <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://…" className="mt-1 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
      </label>
      <CheckRow label="Это разминочный подход — исключить из тоннажа" checked={isWarmup} set={setIsWarmup} />
     {bench && (
      <fieldset>
        <legend className="text-xs text-muted-foreground">Скорость</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(["fast", "normal", "slow"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setVelocity(value)} className={`h-10 rounded-md border text-xs font-semibold ${velocity === value ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{value === "fast" ? "Быстро" : value === "slow" ? "Медленно" : "Нормально"}</button>
          ))}
        </div>
      </fieldset>
        )}
      <Button type="submit" disabled={saving} variant={canQuickSave ? "outline" : "default"} className="h-11 w-full">
        {saving ? "Сохраняю…" : canQuickSave ? "Записать без оценки усилия" : "Записать подход"}
      </Button>
    </form>
  );
}

function EditSetForm({ set, onSave, onCancel }: { set: SessionSetRow; onSave: (values: { weight: number | null; reps: number | null; rir: number | null; rpe: number | null }) => void; onCancel: () => void }) {
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : "");
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : "");
  const [rir, setRir] = useState<number | null>(set.rir);
  const [rpe, setRpe] = useState<number | null>(set.rpe ?? null);
  return (
    <form className="space-y-2" onSubmit={(event) => {
      event.preventDefault();
      const parsedWeight = weight.trim() ? Number.parseFloat(weight.replace(",", ".")) : null;
      const parsedReps = reps.trim() ? Number.parseInt(reps, 10) : null;
      onSave({ weight: Number.isNaN(parsedWeight as number) ? null : parsedWeight, reps: Number.isNaN(parsedReps as number) ? null : parsedReps, rir, rpe });
    }}>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Вес" value={weight} onChange={(event) => setWeight(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
        <input aria-label="Повторения" value={reps} onChange={(event) => setReps(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
      </div>
      <ScaleButtons label="RPE" values={[6, 7, 8, 9, 10]} selected={rpe} set={setRpe} />
      <ScaleButtons label="RIR" values={[0, 1, 2, 3, 4, 5]} selected={rir} set={setRir} />
      <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Отмена</Button><Button type="submit" className="flex-1">Сохранить</Button></div>
    </form>
  );
}

function ScaleButtons({ label, values, selected, set, quickSave }: {
  label: string;
  values: readonly number[];
  selected: number | null;
  set: (value: number | null) => void;
  /** Когда задан, касание по шкале сразу записывает подход, а не просто выбирает значение. */
  quickSave?: (value: number) => void;
}) {
  return (
    <fieldset><legend className="text-xs text-muted-foreground">{label}</legend><div className="mt-1 flex flex-wrap gap-1.5">{values.map((value) => <button key={value} type="button" onClick={() => (quickSave ? quickSave(value) : set(selected === value ? null : value))} className={`min-h-11 min-w-10 flex-1 rounded-md border px-2 text-xs font-semibold ${selected === value ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{value}</button>)}</div></fieldset>
  );
}

function SelectField({ label, value, set, options }: { label: string; value: string; set: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <label className="text-xs text-muted-foreground">{label}<select value={value} onChange={(event) => set(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">—</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

function CheckRow({ label, checked, set }: { label: string; checked: boolean; set: (checked: boolean) => void }) {
  return <label className="flex min-h-10 items-start gap-3 py-1.5 text-sm"><input type="checkbox" checked={checked} onChange={(event) => set(event.target.checked)} className="mt-0.5 size-4 accent-current" /><span>{label}</span></label>;
}

function readinessName(level: string) {
  return level === "green" ? "зелёная" : level === "yellow" ? "жёлтая" : level === "orange" ? "оранжевая" : "красная";
}

function readinessAction(level: string) {
  if (level === "yellow") return "Без синглов/тестов; −2,5–5% или −1 сет.";
  if (level === "orange") return "Только техника 50–65% RMref, 2–3×3; подсобка сокращена.";
  if (level === "red") return "Тренировка и разминка запрещены.";
  return "План допустим; специальные элементы требуют собственных шлюзов.";
}

function isOffline(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}
