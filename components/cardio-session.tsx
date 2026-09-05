"use client";

import { cardioPlan } from "@/lib/program/policy";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeartRateBadge } from "@/components/heart-rate";
import { useHeartRate, useWakeLock, averageBpmSince } from "@/lib/heart-rate";
import { cancelSession, finishCardioSession } from "@/app/actions/workout";
import { unlockAudio } from "@/lib/sound";
import {
  cancelLocalSession,
  finishLocalCardioSession,
  pushOp,
} from "@/lib/offline";
import {
  elapsedSeconds,
  pauseClock,
  resumeClock,
  type CardioClock,
} from "@/lib/cardio-clock";

type Talk = "full_sentences" | "short_phrases" | "difficult";
type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function CardioSession({
  session,
  workout,
  cycle,
}: {
  session: {
    id: number | string;
    status: string;
    startedAt: string;
    durationSeconds?: number | null;
    speed?: string | null;
    resistance?: string | null;
    readinessLevel?: string | null;
    adaptationPlan?: unknown;
    supportLog?: unknown;
    cardioRpe?: number | null;
    cardioTalkTest?: string | null;
    cardioSymptoms?: string | null;
    modality?: string | null;
    warmupMinutes?: number | null;
    mainMinutes?: number | null;
    cooldownMinutes?: number | null;
  };
  workout: {
    id: number;
    title: string;
    cardioZone: string | null;
    cardioMinutes: string | null;
    prescription?: unknown;
  };
  cycle: { number: number; name: string };
  lastCardio?: unknown;
}) {
  const router = useRouter();
  const heartRate = useHeartRate();
  const readOnly = session.status !== "active";
  const originalMinutes = Number(
    (workout.prescription as { duration?: { min?: number } } | null)?.duration
      ?.min ?? 0,
  );
  const blocked =
    session.readinessLevel === "red" ||
    session.readinessLevel === "orange" ||
    originalMinutes === 0;
  useWakeLock(!readOnly && !blocked);
  const key = `gym:cardio-clock:${session.id}`;
  const prescription = (workout.prescription ?? {}) as {
    duration?: { min?: number; max?: number } | null;
    cardio?: {
      zone?: string | null;
      warmupMinutes?: number;
      mainMinutes?: { min?: number; max?: number };
      cooldownMinutes?: number;
      prescriptionText?: string;
    } | null;
  };
  const coachPatch =
    session.adaptationPlan && typeof session.adaptationPlan === "object"
      ? ((
          session.adaptationPlan as {
            coachAdjustment?: { patch?: Record<string, unknown> };
          }
        ).coachAdjustment?.patch ?? {})
      : {};
  const capped = cardioPlan(
    originalMinutes,
    session.readinessLevel ?? "green",
    coachPatch,
  );
  const readinessPlan = {
    min: capped.minutes,
    max: capped.minutes,
    zone: capped.blocked
      ? null
      : capped.light
        ? "Z1"
        : (prescription.cardio?.zone ?? workout.cardioZone ?? "Z1"),
    note: capped.note,
  };
  const snapshot = (
    session.adaptationPlan as {
      revision30?: {
        profile?: { supportMode?: number };
        exercises?: Array<{
          id: number;
          role?: string;
          name: string;
          targetSets: string | null;
          targetReps: string | null;
          comment?: string | null;
        }>;
      };
    } | null
  )?.revision30;
  const support = snapshot?.exercises?.filter((e) => e.role === "rehab") ?? [];
  const [supportDone, setSupportDone] = useState<number[]>(
    (session.supportLog as { completedIds?: number[] } | null)?.completedIds ??
      [],
  );
  const [clock, setClock] = useState<CardioClock | null>(null);
  const [now, setNow] = useState(Date.now());
  const [speed, setSpeed] = useState(session.speed ?? "");
  const [resistance, setResistance] = useState(session.resistance ?? "");
  const [modality, setModality] = useState(session.modality ?? "Велосипед");
  const [warmupMinutes, setWarmupMinutes] = useState<number | null>(
    session.warmupMinutes ?? null,
  );
  const [mainMinutes, setMainMinutes] = useState<number | null>(
    session.mainMinutes ?? null,
  );
  const [cooldownMinutes, setCooldownMinutes] = useState<number | null>(
    session.cooldownMinutes ?? null,
  );
  const [talk, setTalk] = useState<Talk | null>(
    (session.cardioTalkTest as Talk | null) ?? null,
  );
  const [rpe, setRpe] = useState<number | null>(session.cardioRpe ?? null);
  const [symptoms, setSymptoms] = useState(session.cardioSymptoms ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setClock(JSON.parse(raw));
      else {
        const initial = {
          accumulatedMs:
            readOnly && session.durationSeconds != null
              ? session.durationSeconds * 1000
              : 0,
          runningSince: null,
        };
        setClock(initial);
        localStorage.setItem(key, JSON.stringify(initial));
      }
    } catch {
      setClock({ accumulatedMs: 0, runningSince: null });
    }
  }, [key, readOnly, session.durationSeconds]);

  useEffect(() => {
    if (!clock) return;
    localStorage.setItem(key, JSON.stringify(clock));
    if (clock.runningSince == null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [clock, key]);

  const elapsed = useMemo(
    () => (clock ? elapsedSeconds(clock, now) : 0),
    [clock, now],
  );
  const running = clock?.runningSince != null;

  function toggle() {
    if (!clock || blocked) return;
    unlockAudio();
    const timestamp = Date.now();
    setNow(timestamp);
    setClock(
      clock.runningSince == null
        ? resumeClock(clock, timestamp)
        : pauseClock(clock, timestamp),
    );
  }

  async function finish() {
    if (!clock || saveState === "saving") return;
    const timestamp = Date.now();
    const durationSeconds = elapsedSeconds(clock, timestamp);
    const data = {
      durationSeconds,
      avgHr: averageBpmSince(timestamp - durationSeconds * 1000),
      speed: speed.trim() || null,
      resistance: resistance.trim() || null,
      modality: modality.trim() || null,
      warmupMinutes,
      mainMinutes,
      cooldownMinutes,
      supportLog: {
        completedIds: supportDone,
        mode: snapshot?.profile?.supportMode ?? 0,
      },
      cardioRpe: rpe,
      cardioTalkTest: talk,
      cardioSymptoms: symptoms.trim() || null,
    };
    setClock({ accumulatedMs: durationSeconds * 1000, runningSince: null });
    setSaveState("saving");
    if (typeof session.id === "string") {
      finishLocalCardioSession(session.id, data);
      localStorage.removeItem(key);
      setSaveState("queued");
      window.setTimeout(() => router.push("/history"), 700);
      return;
    }
    try {
      await finishCardioSession({ sessionId: session.id, ...data });
      localStorage.removeItem(key);
      setSaveState("saved");
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        pushOp({
          kind: "cardioFinish",
          sessionRef: session.id,
          finishedAt: new Date(timestamp).toISOString(),
          ...data,
        });
        localStorage.removeItem(key);
        setSaveState("queued");
      } else {
        setSaveState("error");
        return;
      }
    }
    window.setTimeout(() => router.push("/history"), 700);
  }

  /**
   * Отмена кардио-сессии.
   *
   * Кнопки не было вовсе: силовая сессия давала её всегда, кардио — никогда,
   * и начатую по ошибке сессию нельзя было убрать. Хуже того, на красном статусе
   * скрывалась вся нижняя панель целиком, поэтому сессия, начатая до появления
   * стоп-сигнала, оставалась активной навсегда.
   */
  async function cancel() {
    if (
      !window.confirm(
        "Отменить кардио-тренировку? Записанное время и параметры будут удалены.",
      )
    ) {
      return;
    }
    localStorage.removeItem(key);
    if (typeof session.id === "string") {
      cancelLocalSession(session.id);
      router.push("/");
      return;
    }
    try {
      await cancelSession(session.id);
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        pushOp({ kind: "cancel", sessionRef: session.id });
        router.push("/");
      } else {
        setSaveState("error");
      }
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg pb-48">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href={`/workout/${workout.id}`}
          className="grid size-11 place-items-center"
          aria-label="Назад"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            Цикл {cycle.number} — {cycle.name}
          </p>
          <b>{workout.title}</b>
        </div>
        <HeartRateBadge />
      </header>

      <div className="space-y-4 p-4">
        {blocked && (
          <section className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <strong>Кардио заблокировано.</strong>
              <p className="mt-1">{readinessPlan.note}</p>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <small className="text-muted-foreground">ФАКТИЧЕСКОЕ ВРЕМЯ</small>
          <div className="font-mono text-6xl font-bold">
            {formatTime(elapsed)}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            План:{" "}
            {readinessPlan.min === readinessPlan.max
              ? readinessPlan.min
              : `${readinessPlan.min}–${readinessPlan.max}`}{" "}
            мин · {readinessPlan.zone ?? "отдых"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {readinessPlan.note}
          </p>
        </section>

        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <b>Главный ориентир — разговорный тест</b>
          <p className="mt-1 text-sm text-muted-foreground">
            Z1: свободный разговор. Z2: полные предложения, RPE 2–3/10. Если
            речь распадается на короткие фразы — снизьте сопротивление или
            перейдите в Z1. Пульс только справочный.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4">
          <Input label="Модальность" value={modality} set={setModality} />
          <Input label="Скорость" value={speed} set={setSpeed} />
          <Input label="Сопротивление" value={resistance} set={setResistance} />
          <div className="text-sm text-muted-foreground">
            Пульс
            <div className="mt-1 h-11 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground">
              {heartRate.bpm != null
                ? `${heartRate.bpm} уд/мин`
                : "не подключён"}
            </div>
          </div>
          <NumberInput
            label="Разминка, мин"
            value={warmupMinutes}
            set={setWarmupMinutes}
          />
          <NumberInput
            label="Основная Z1/Z2, мин"
            value={mainMinutes}
            set={setMainMinutes}
          />
          <NumberInput
            label="Заминка, мин"
            value={cooldownMinutes}
            set={setCooldownMinutes}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <b>Итог кардио</b>
          {(
            [
              ["full_sentences", "Получалось говорить полными предложениями"],
              [
                "short_phrases",
                "Только короткими фразами — темп был выше цели",
              ],
              ["difficult", "Говорить было трудно — прекратить/снизить"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTalk(value)}
              className={`min-h-11 w-full rounded-lg border px-3 text-left text-sm ${talk === value ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {label}
            </button>
          ))}
          <label className="block text-sm">
            Субъективная нагрузка: {rpe == null ? "не оценена" : `${rpe}/10`}
            <input
              type="range"
              min="1"
              max="10"
              value={rpe ?? 2}
              onChange={(event) => setRpe(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <textarea
            value={symptoms}
            onChange={(event) => setSymptoms(event.target.value)}
            placeholder="Симптомы: нет или опишите…"
            className="min-h-20 w-full rounded-lg border border-input bg-background p-3"
          />
        </section>

        {support.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-bold">Необязательная поддержка</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Сначала приостановите таймер: время комплекса не входит в кардио.
              Один согласованный режим вместо исходного, не поверх него. Не
              через боль.
            </p>
            <div className="mt-3 space-y-2">
              {support.map((e) => (
                <label
                  key={e.id}
                  className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"
                >
                  <input
                    type="checkbox"
                    disabled={readOnly || blocked}
                    checked={supportDone.includes(e.id)}
                    onChange={(event) =>
                      setSupportDone(
                        event.target.checked
                          ? [...supportDone, e.id]
                          : supportDone.filter((id) => id !== e.id),
                      )
                    }
                    className="mt-1 size-5 shrink-0"
                  />
                  <span>
                    <strong>{e.name}</strong> · {e.targetSets}×{e.targetReps}
                    <span className="block text-muted-foreground">
                      Отметьте только фактически выполненное в согласованном
                      объёме.
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}
        {!readOnly && elapsed > 0 && blocked && (
          <Button className="min-h-12 w-full" onClick={finish}>
            Сохранить фактическое время и завершить
          </Button>
        )}
        {saveState !== "idle" && (
          <div
            className={`flex gap-2 rounded-lg p-3 text-sm ${saveState === "queued" ? "bg-warning/15 text-warning" : saveState === "error" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}
          >
            {saveState === "queued" ? (
              <CloudOff className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {saveState === "saving"
              ? "Сохраняю…"
              : saveState === "saved"
                ? "Сохранено"
                : saveState === "queued"
                  ? "Ждёт синхронизации"
                  : "Ошибка сохранения"}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3">
          {/* Управление таймером скрыто на красном статусе, отмена — нет:
              иначе начатую сессию нечем закрыть. */}
          {!blocked && (
            <div className="mx-auto flex max-w-lg gap-3">
              <Button variant="outline" className="flex-1" onClick={toggle}>
                {running ? (
                  <>
                    <Pause /> Пауза
                  </>
                ) : (
                  <>
                    <Play /> {elapsed > 0 ? "Продолжить" : "Старт"}
                  </>
                )}
              </Button>
              <Button
                className="flex-[2]"
                onClick={finish}
                disabled={elapsed === 0}
              >
                <Square /> Завершить кардио
              </Button>
            </div>
          )}
          <button
            type="button"
            onClick={cancel}
            className="mx-auto mt-2 block w-full max-w-lg text-center text-sm text-muted-foreground hover:text-destructive"
          >
            Отменить тренировку
          </button>
        </div>
      )}
    </main>
  );
}

function Input({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
}) {
  return (
    <label className="text-sm text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => set(event.target.value)}
        className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground"
      />
    </label>
  );
}
function NumberInput({
  label,
  value,
  set,
}: {
  label: string;
  value: number | null;
  set: (value: number | null) => void;
}) {
  return (
    <label className="text-sm text-muted-foreground">
      {label}
      <input
        type="number"
        min="0"
        max="180"
        value={value ?? ""}
        onChange={(event) =>
          set(event.target.value === "" ? null : Number(event.target.value))
        }
        className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground"
      />
    </label>
  );
}
