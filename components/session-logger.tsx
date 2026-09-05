"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseGuideButton } from "@/components/exercise-guide-sheet";
import { ExerciseHistory } from "@/components/exercise-history";
import { HeartRateBadge } from "@/components/heart-rate";
import { RestTimer } from "@/components/rest-timer";
import { SessionNotes } from "@/components/session-notes";
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
import type { LoggedSetLite, Recommendation } from "@/lib/recommend";
import {
  DEFAULT_SAFETY_PROFILE,
  buildWarmup,
  formatWarmup,
  isPrimaryRole,
  nextSetAdvice,
  type SafetyProfile,
  type EffortSet,
} from "@/lib/program/policy";

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
  plannedKg?: number | null;
  hardCeilingKg?: number | null;
  warmupText?: string | null;
  progressionEligible?: boolean;
  afterControlLight?: boolean;
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
type Draft = {
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  velocity: "fast" | "normal" | "slow" | null;
  stickingPoint: "chest" | "middle" | "lockout" | null;
  isWarmup: boolean;
  pauseQuality: "clean" | "short" | "lost" | null;
  touchPoint: "stable" | "high" | "low" | "variable" | null;
  trajectoryQuality: "clean" | "asymmetric" | "deviated" | null;
  techniqueSigns: string[];
  painScore: number | null;
  symptoms: string[];
  videoUrl: string | null;
};
const field =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base";
const parse = (s: string) =>
  s.trim() === "" ? null : Number(s.replace(",", "."));
function offlineError(error: unknown) {
  return (
    !navigator.onLine ||
    (error instanceof TypeError &&
      /fetch|network|load failed/i.test(error.message))
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
  profile = DEFAULT_SAFETY_PROFILE,
  rmrefKg = 115,
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
  profile?: SafetyProfile;
  rmrefKg?: number;
}) {
  const router = useRouter();
  const [sets, setSets] = useState(initialSets);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [rest, setRest] = useState<{
    seconds: number;
    label: string;
    recommendation: Recommendation;
  } | null>(null);
  const readOnly = session.status !== "active";
  const ref = offlineKey ?? session.id;
  useWakeLock(!readOnly);
  const current = exercises[Math.min(index, Math.max(0, exercises.length - 1))];
  const own = current
    ? sets.filter((s) => s.workoutExerciseId === current.id)
    : [];
  const working = own.filter((s) => !s.isWarmup);
  const facts: EffortSet[] = sets.map((s) => ({
    ...s,
    role: exercises.find((e) => e.id === s.workoutExerciseId)?.role ?? "",
  }));
  const targetSets = Number(current?.targetSets?.match(/^\d+/)?.[0] ?? 1);
  const advice = current
    ? nextSetAdvice({
        sets: facts,
        exerciseId: current.id,
        role: current.role ?? "",
        targetSets,
        targetRpeMax: current.targetRpeMax ?? null,
        plannedKg: current.plannedKg ?? null,
        profile,
        readiness: session.readinessLevel ?? "yellow",
        progressionEligible: current.progressionEligible === true,
        afterControlLight: current.afterControlLight,
      })
    : null;
  const blocked = session.safetyStopped === true || advice?.blocked === true;
  const previous = current ? (lastSetsByName[current.name] ?? []) : [];
  const defaultWeight =
    current && isPrimaryRole(current.role ?? "")
      ? (advice?.weight ?? null)
      : (current?.plannedKg ??
        own.at(-1)?.weight ??
        previous.at(-1)?.weight ??
        null);
  useEffect(() => {
    const synced = (event: Event) => {
      const mappings =
        (
          event as CustomEvent<{
            mappings: Array<{
              sessionRef: number | string;
              workoutExerciseId: number;
              setNumber: number;
              setId: number;
            }>;
          }>
        ).detail?.mappings ?? [];
      setSets((previous) =>
        previous.map((row) => {
          const match = mappings.find(
            (m) =>
              m.sessionRef === ref &&
              m.workoutExerciseId === row.workoutExerciseId &&
              m.setNumber === row.setNumber,
          );
          return match ? { ...row, id: match.setId } : row;
        }),
      );
    };
    window.addEventListener("gym:synced", synced);
    return () => window.removeEventListener("gym:synced", synced);
  }, [ref]);
  function commitSets(next: SessionSetRow[]) {
    setSets(next);
    if (offlineKey) saveLocalSets(offlineKey, next);
  }
  async function finish() {
    setBusy(true);
    setError(null);
    try {
      if (offlineKey) {
        finishLocalSession(offlineKey);
        router.push("/history");
        return;
      }
      await finishSession(session.id);
    } catch (e) {
      if (offlineError(e)) {
        pushOp({
          kind: "finish",
          sessionRef: ref,
          finishedAt: new Date().toISOString(),
        });
        router.push("/history");
      } else setError(e instanceof Error ? e.message : "Не удалось завершить.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (
      !confirm(
        "Отменить активную тренировку и удалить её подходы? Завершённая история не затрагивается.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      if (offlineKey) {
        cancelLocalSession(offlineKey);
        router.push("/");
        return;
      }
      await cancelSession(session.id);
    } catch (e) {
      if (offlineError(e)) {
        pushOp({ kind: "cancel", sessionRef: ref });
        router.push("/");
      } else setError(e instanceof Error ? e.message : "Не удалось отменить.");
    } finally {
      setBusy(false);
    }
  }
  async function save(draft: Draft) {
    if (!current) return;
    const setNumber = Math.max(0, ...own.map((s) => s.setNumber)) + 1;
    const temporaryId = -Date.now();
    const payload = {
      sessionRef: ref,
      workoutExerciseId: current.id,
      setNumber,
      ...draft,
    };
    let savedId = temporaryId;
    if (offlineKey || typeof ref === "string")
      pushOp({ kind: "set", ...payload });
    else {
      try {
        savedId = (await logSet({ sessionId: ref, ...payload })).id;
      } catch (e) {
        if (offlineError(e)) pushOp({ kind: "set", ...payload });
        else throw e;
      }
    }
    // Update the UI only after a confirmed write or a durable outbox entry.
    commitSets([
      ...sets,
      { id: savedId, workoutExerciseId: current.id, setNumber, ...draft },
    ]);
    if (current.restSeconds && !draft.symptoms.length) {
      setRest({
        seconds: current.restSeconds,
        label: `Отдых · ${current.name}`,
        recommendation: null,
      });
    }
  }
  async function remove(row: SessionSetRow) {
    if (!confirm("Удалить этот подход?")) return;
    setError(null);
    try {
      if (row.id < 0 || offlineKey) {
        const removed = removeQueuedLocalSet(
          ref,
          row.workoutExerciseId,
          row.setNumber,
        );
        if (!removed && row.id > 0)
          pushOp({ kind: "deleteSet", setId: row.id });
      } else
        try {
          await deleteSet(row.id, session.id);
        } catch (e) {
          if (offlineError(e)) pushOp({ kind: "deleteSet", setId: row.id });
          else throw e;
        }
      commitSets(sets.filter((s) => s.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить.");
    }
  }
  async function edit(
    row: SessionSetRow,
    values: {
      weight: number | null;
      reps: number | null;
      rir: number | null;
      rpe: number | null;
    },
  ) {
    if (row.id < 0 || offlineKey) {
      const replaced = replaceQueuedLocalSet(
        ref,
        row.workoutExerciseId,
        row.setNumber,
        values,
      );
      if (!replaced && row.id > 0)
        pushOp({
          kind: "updateSet",
          sessionRef: ref,
          setId: row.id,
          ...values,
        });
    } else
      try {
        await updateSet({ setId: row.id, sessionId: session.id, ...values });
      } catch (e) {
        if (offlineError(e))
          pushOp({
            kind: "updateSet",
            sessionRef: ref,
            setId: row.id,
            ...values,
          });
        else throw e;
      }
    commitSets(sets.map((s) => (s.id === row.id ? { ...s, ...values } : s)));
    setEditing(null);
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-56">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link
            href={`/workout/${workout.id}`}
            aria-label="Назад к плану"
            className="grid size-11 shrink-0 place-items-center"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              {cycle.block.toUpperCase()} · цикл {cycle.number} ·{" "}
              {workout.slot ?? ""}
            </p>
            <h1 className="truncate text-base font-bold">{workout.title}</h1>
          </div>
          <HeartRateBadge />
        </div>
      </header>
      <div className="space-y-4 px-4 py-4">
        <section
          className={`rounded-xl border p-4 readiness-${session.readinessLevel ?? "yellow"}`}
        >
          <strong>
            Готовность:{" "}
            {session.readinessLevel === "green"
              ? "зелёная"
              : session.readinessLevel === "yellow"
                ? "жёлтая"
                : session.readinessLevel === "orange"
                  ? "оранжевая"
                  : session.readinessLevel === "red"
                    ? "красная"
                    : "не записана"}
          </strong>
          <p className="mt-1 text-sm leading-relaxed">
            {session.readinessLevel === "yellow"
              ? "Начальный вес −5%, на один рабочий сет меньше, подсобка примерно вдвое. Без прибавок и КТ."
              : session.readinessLevel === "orange"
                ? "Вместо плана 2×3 примерно на 50–60% R, легко, без подсобки. При дискомфорте отменить."
                : session.readinessLevel === "red"
                  ? "Никакой тренировки и разминки. Действовать по симптомам."
                  : "Сначала безопасность и техника, затем запас повторов, только потом килограммы."}
          </p>
          <p className="mt-2 text-sm">
            R сессии: {rmrefKg} кг.{" "}
            {profile.loadCeilingKg != null
              ? `Личный предел: ${profile.loadCeilingKg} кг.`
              : "Числовой предел не записан; это не разрешение на максимум."}
          </p>
        </section>
        {current ? (
          <>
            <section className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Упражнение {index + 1} из {exercises.length}
              </p>
              <div className="mt-1 flex items-start gap-2">
                <h2 className="min-w-0 flex-1 text-2xl font-bold leading-tight">
                  {current.name}
                </h2>
                <ExerciseGuideButton exerciseName={current.name} />
              </div>
              <p className="mt-3 font-mono text-xl font-semibold">
                {current.targetSets} × {current.targetReps}
              </p>
              <p className="mt-1 text-base text-primary">
                {current.weightText}
              </p>
              <p className="mt-2 text-sm">
                {current.targetRpeMax != null
                  ? `RPE ${current.targetRpeMin ?? "≤"}${current.targetRpeMin != null && current.targetRpeMin !== current.targetRpeMax ? "–" : ""}${current.targetRpeMin !== current.targetRpeMax ? current.targetRpeMax : ""}`
                  : current.targetRirMin != null
                    ? `RIR ${current.targetRirMin}${current.targetRirMax != null && current.targetRirMax !== current.targetRirMin ? `–${current.targetRirMax}` : current.targetRirMax == null ? "+" : ""}`
                    : "Усилие подбирается отдельно"}{" "}
                · отдых {current.restSeconds ?? 0} с
              </p>
              {current.comment && (
                <details className="mt-3 rounded-lg bg-secondary p-3">
                  <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                    Условия и подсказки
                  </summary>
                  <p className="whitespace-pre-line text-sm leading-relaxed">
                    {current.comment}
                  </p>
                </details>
              )}
            </section>
            {!readOnly && previous.length > 0 && (
              <section className="rounded-xl border border-border p-3">
                <h3 className="text-sm font-semibold">
                  Прошлое выполнение · факт, не новая цель
                </h3>
                <p className="mt-2 text-sm font-mono leading-relaxed">
                  {previous
                    .map(
                      (s) =>
                        `${s.weight ?? "—"}×${s.reps ?? "—"} · RIR ${s.rir ?? "—"}`,
                    )
                    .join("; ")}
                </p>
              </section>
            )}
            {advice && isPrimaryRole(current.role ?? "") && (
              <div
                className={`rounded-xl border p-4 text-sm leading-relaxed ${blocked ? "border-warning/40 bg-warning/10" : "border-border bg-secondary"}`}
              >
                <strong>
                  {blocked
                    ? "Новые подходы этой строки остановлены"
                    : advice.weight != null
                      ? `Следующий вес: ${advice.weight} кг`
                      : "Выберите знакомый вес, без автоматического теста"}
                </strong>
                <p className="mt-1">{advice.reason}</p>
                {advice.state.reasons.map((r) => (
                  <p key={r} className="mt-1">
                    {r}
                  </p>
                ))}
              </div>
            )}
            {session.safetyStopped && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
              >
                Сессия остановлена. Фактические записи сохранены; нагрузку не
                продолжать.
              </p>
            )}
            <section>
              <h3 className="text-sm font-semibold">
                Рабочие подходы: {working.length} из {targetSets}
                {own.length > working.length
                  ? ` · разминка: ${own.length - working.length}`
                  : ""}
              </h3>
              <ul className="mt-2 space-y-2">
                {own.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    {editing === row.id ? (
                      <EditSet
                        row={row}
                        save={(v) => edit(row, v)}
                        cancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <p className="text-base font-semibold">
                          {row.isWarmup ? "Разминка" : "Подход"} {row.setNumber}{" "}
                          · {row.weight ?? "—"} кг × {row.reps ?? "—"}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-muted-foreground">
                            RPE {row.rpe ?? "—"} · RIR {row.rir ?? "—"}
                          </span>
                          {!readOnly && (
                            <div className="flex">
                              <button
                                className="grid size-11 place-items-center"
                                aria-label="Редактировать подход"
                                onClick={() => setEditing(row.id)}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                className="grid size-11 place-items-center"
                                aria-label="Удалить подход"
                                onClick={() => void remove(row)}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            {!readOnly && !blocked && (
              <SetForm
                key={`${current.id}:${own.length}`}
                exercise={current}
                defaultWeight={defaultWeight}
                profile={profile}
                save={save}
              />
            )}
            {!offlineKey && <ExerciseHistory exerciseName={current.name} />}
          </>
        ) : (
          <p className="rounded-xl border border-border p-4">
            В этой сессии нет доступной силовой работы.
          </p>
        )}
        {!offlineKey && (
          <SessionNotes
            sessionId={session.id}
            initialNotes={session.notes ?? null}
            readOnly={readOnly}
          />
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              disabled={index === 0}
              onClick={() => setIndex(Math.max(0, index - 1))}
            >
              <ArrowLeft className="size-4" />
              Назад
            </Button>
            {index < exercises.length - 1 ? (
              <Button
                className="min-h-11 flex-[2]"
                onClick={() => setIndex(index + 1)}
              >
                Следующее
                <ArrowRight className="size-4" />
              </Button>
            ) : readOnly ? (
              <Button
                render={<Link href="/history" />}
                className="min-h-11 flex-[2]"
              >
                К истории
              </Button>
            ) : (
              <Button
                className="min-h-11 flex-[2]"
                disabled={busy}
                onClick={() => void finish()}
              >
                <Check className="size-4" />
                Завершить
              </Button>
            )}
          </div>
          {!readOnly && (
            <button
              className="mt-2 min-h-11 w-full text-sm text-muted-foreground"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Отменить тренировку
            </button>
          )}
        </div>
      </footer>
      {rest && <RestTimer {...rest} onClose={() => setRest(null)} />}
    </main>
  );
}
function SetForm({
  exercise,
  defaultWeight,
  profile,
  save,
}: {
  exercise: SessionExercise;
  defaultWeight: number | null;
  profile: SafetyProfile;
  save: (d: Draft) => Promise<void>;
}) {
  const [weight, setWeight] = useState(
    defaultWeight == null ? "" : String(defaultWeight),
  );
  const [reps, setReps] = useState(
    exercise.targetReps?.match(/^\d+/)?.[0] ?? "",
  );
  const [rpe, setRpe] = useState<number | null>(null);
  const [rir, setRir] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  const [clean, setClean] = useState(false);
  const [velocity, setVelocity] = useState<Draft["velocity"]>(null);
  const [signs, setSigns] = useState<string[]>([]);
  const [medical, setMedical] = useState(false);
  const [painMovement, setPainMovement] = useState(false);
  const [controlLoss, setControlLoss] = useState(false);
  const [pain, setPain] = useState(0);
  const [video, setVideo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primary = isPrimaryRole(exercise.role ?? "");
  const parsedWeight = parse(weight);
  const control = /calibration|test_triple/.test(exercise.role ?? "");
  const ladder =
    primary && !warmup
      ? formatWarmup(
          buildWarmup(
            parsedWeight,
            profile,
            control
              ? "control"
              : (exercise.targetRpeMax ?? 8) <= 6
                ? "light"
                : "normal",
            (parsedWeight ?? 0) >= 90,
          ),
        )
      : "";
  const over =
    primary &&
    parsedWeight != null &&
    profile.loadCeilingKg != null &&
    parsedWeight > profile.loadCeilingKg;
  async function submit() {
    setError(null);
    const kg = parse(weight);
    const n = parse(reps);
    if (
      (kg != null && (!Number.isFinite(kg) || kg < 0 || kg > 500)) ||
      (n != null && (!Number.isInteger(n) || n < 0 || n > 100)) ||
      (primary && (kg == null || kg <= 0 || n == null))
    ) {
      setError("Проверьте фактические вес и повторения.");
      return;
    }
    setBusy(true);
    unlockAudio();
    try {
      await save({
        weight: kg,
        reps: n,
        rir,
        rpe,
        velocity,
        stickingPoint: null,
        isWarmup: warmup,
        pauseQuality: primary && clean ? "clean" : null,
        touchPoint: primary && clean ? "stable" : null,
        trajectoryQuality: clean ? "clean" : null,
        techniqueSigns: signs,
        painScore: pain,
        symptoms: [
          ...(medical ? ["medical_symptom"] : []),
          ...(painMovement ? ["pain_changes_movement"] : []),
          ...(controlLoss ? ["unsafe_loss_of_control"] : []),
        ],
        videoUrl: video.trim() || null,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Запись не сохранена. Повторите после проверки связи.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="text-lg font-bold">Фактический подход</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Вес, кг
          <input
            aria-label="Фактический вес"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          Повторения
          <input
            aria-label="Фактические повторения"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className={field}
          />
        </label>
      </div>
      {over && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          Вес выше личного предела: не выполняйте этот подход. Если он уже
          произошёл, сохраните факт — дальнейшая нагрузка будет остановлена.
        </p>
      )}
      {ladder && (
        <details className="rounded-lg bg-secondary p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            Разминка к введённому рабочему весу
          </summary>
          <p className="text-sm font-mono leading-relaxed">{ladder}</p>
          <p className="mt-2 text-sm">
            Сначала 5–7 минут легко, 1×8 движений лопатками. Ранний отдых 60–90
            с, перед работой 2–4 мин; перед КТ 4–5 мин. Не выше рабочего веса
            или C.
          </p>
        </details>
      )}
      {exercise.targetRirMin == null || primary ? (
        <Effort
          label="Фактический RPE · оцените запас, не скорость"
          values={[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10]}
          value={rpe}
          set={setRpe}
        />
      ) : (
        <Effort
          label="Фактический RIR · сколько чистых повторов осталось"
          values={[0, 1, 2, 3, 4, 5, 6]}
          value={rir}
          set={setRir}
        />
      )}
      <p className="text-sm text-muted-foreground">
        Ничего не выбрано заранее. Можно оставить оценку неизвестной; такие
        данные не подтверждают повышение нагрузки. Для лёгких подходов не нужно
        придумывать точный RPE.
      </p>
      <CheckRow
        label={
          primary
            ? "Пауза, касание и траектория были сопоставимыми и чистыми"
            : "Техника была чистой, без боли и компенсаций"
        }
        checked={clean}
        set={setClean}
      />
      <div className="rounded-lg border border-destructive/30 p-3">
        <CheckRow
          label="Появился медицинский симптом"
          checked={medical}
          set={setMedical}
        />
        <CheckRow
          label="Боль изменила движение"
          checked={painMovement}
          set={setPainMovement}
        />
        <CheckRow
          label="Опасная потеря контроля"
          checked={controlLoss}
          set={setControlLoss}
        />
      </div>
      <details className="rounded-lg border border-border p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Техника, скорость, боль и видео
        </summary>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Скорость — отдельное наблюдение, она не вычисляет RPE.
          </p>
          <label className="block text-sm">
            Наблюдаемая скорость
            <select
              value={velocity ?? ""}
              onChange={(e) =>
                setVelocity((e.target.value || null) as Draft["velocity"])
              }
              className={field}
            >
              <option value="">Не оценена</option>
              <option value="fast">Быстро</option>
              <option value="normal">Обычно</option>
              <option value="slow">Медленно</option>
            </select>
          </label>
          {[
            ["pause_or_touch_lost", "Потеря паузы или касания"],
            ["asymmetry", "Асимметрия"],
            ["unexpected_slowdown", "Неожиданное замедление"],
            ["hips_lifted", "Отрыв таза"],
            ["grinder", "Выраженный гриндер"],
          ].map(([id, label]) => (
            <CheckRow
              key={id}
              label={label}
              checked={signs.includes(id)}
              set={(v) =>
                setSigns(v ? [...signs, id] : signs.filter((s) => s !== id))
              }
            />
          ))}
          <label className="block text-sm">
            Боль: {pain}/10
            <input
              aria-label="Боль"
              type="range"
              min="0"
              max="10"
              value={pain}
              onChange={(e) => setPain(Number(e.target.value))}
              className="mt-3 w-full"
            />
          </label>
          <label className="block text-sm">
            Ссылка на видео
            <input
              type="url"
              value={video}
              onChange={(e) => setVideo(e.target.value)}
              className={field}
              placeholder="https://…"
            />
          </label>
        </div>
      </details>
      <CheckRow
        label="Это разминка — не рабочий сет и не рабочий тоннаж"
        checked={warmup}
        set={setWarmup}
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="min-h-12 w-full">
        {busy
          ? "Сохраняю…"
          : medical || painMovement || controlLoss || over
            ? "Сохранить факт и остановиться"
            : "Сохранить подход"}
      </Button>
    </form>
  );
}
function Effort({
  label,
  values,
  value,
  set,
}: {
  label: string;
  values: number[];
  value: number | null;
  set: (n: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => set(value === n ? null : n)}
            className={`min-h-11 min-w-11 flex-1 rounded-lg border px-2 text-sm font-semibold ${value === n ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function CheckRow({
  label,
  checked,
  set,
}: {
  label: string;
  checked: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => set(e.target.checked)}
        className="mt-1 size-5 shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}
function EditSet({
  row,
  save,
  cancel,
}: {
  row: SessionSetRow;
  save: (v: {
    weight: number | null;
    reps: number | null;
    rir: number | null;
    rpe: number | null;
  }) => Promise<void>;
  cancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);
        try {
          await save({
            weight: parse(String(f.get("weight") ?? "")),
            reps: parse(String(f.get("reps") ?? "")),
            rir: parse(String(f.get("rir") ?? "")),
            rpe: parse(String(f.get("rpe") ?? "")),
          });
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Не удалось сохранить.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {[
          ["weight", "Вес", row.weight],
          ["reps", "Повторы", row.reps],
          ["rpe", "RPE", row.rpe],
          ["rir", "RIR", row.rir],
        ].map(([name, label, value]) => (
          <label key={String(name)} className="text-sm">
            {label}
            <input
              name={String(name)}
              type="number"
              step={name === "reps" || name === "rir" ? 1 : 0.5}
              min="0"
              max={name === "weight" ? 500 : name === "reps" ? 100 : 10}
              defaultValue={value ?? ""}
              className={field}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={cancel}>
          Отмена
        </Button>
        <Button type="submit" disabled={busy}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
