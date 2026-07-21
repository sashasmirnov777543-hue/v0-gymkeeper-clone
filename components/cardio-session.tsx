"use client";

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
import { finishCardioSession } from "@/app/actions/workout";
import { unlockAudio } from "@/lib/sound";
import { finishLocalCardioSession, pushOp } from "@/lib/offline";
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
  const blocked = session.readinessLevel === "red";
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
      ? ((session.adaptationPlan as {
          coachAdjustment?: { patch?: Record<string, unknown> };
        }).coachAdjustment?.patch ?? {})
      : {};
  const readinessPlan = useMemo(() => {
    if (session.readinessLevel === "yellow") {
      return { zone: "Z1", min: 15, max: 20, note: "Жёлтый: Z1, прогулка или пропуск." };
    }
    if (session.readinessLevel === "orange") {
      return { zone: "Z1", min: 10, max: 20, note: "Оранжевый: только при полном отсутствии симптомов; допустим отдых." };
    }
    if (blocked) return { zone: null, min: 0, max: 0, note: "Красный: кардио запрещено." };
    if (coachPatch.skip === true) {
      return { zone: null, min: 0, max: 0, note: "Подтверждённая корректировка: пропуск без компенсации." };
    }
    if (coachPatch.replaceWithWalk === true) {
      const minutes = Number(coachPatch.minutes ?? 20);
      return { zone: "walk", min: minutes, max: minutes, note: "Подтверждённая корректировка: лёгкая прогулка." };
    }
    if (Number.isFinite(coachPatch.minutes)) {
      const minutes = Math.max(0, Math.min(60, Number(coachPatch.minutes)));
      return {
        zone: coachPatch.zone === "Z2" ? "Z2" : "Z1",
        min: minutes,
        max: minutes,
        note: "Подтверждённая корректировка Gemini.",
      };
    }
    return {
      zone: prescription.cardio?.zone ?? workout.cardioZone ?? "Z1",
      min: prescription.duration?.min ?? 0,
      max: prescription.duration?.max ?? prescription.duration?.min ?? 0,
      note: prescription.cardio?.prescriptionText ?? workout.cardioMinutes ?? "По плану",
    };
  }, [
    blocked,
    prescription,
    session.readinessLevel,
    session.adaptationPlan,
    workout.cardioMinutes,
    workout.cardioZone,
  ]);

  const [clock, setClock] = useState<CardioClock | null>(null);
  const [now, setNow] = useState(Date.now());
  const [speed, setSpeed] = useState(session.speed ?? "");
  const [resistance, setResistance] = useState(session.resistance ?? "");
  const [modality, setModality] = useState(session.modality ?? "Велосипед");
  const [warmupMinutes, setWarmupMinutes] = useState(
    session.warmupMinutes ?? prescription.cardio?.warmupMinutes ?? 0,
  );
  const [mainMinutes, setMainMinutes] = useState(
    session.mainMinutes ?? prescription.cardio?.mainMinutes?.min ?? readinessPlan.min,
  );
  const [cooldownMinutes, setCooldownMinutes] = useState(
    session.cooldownMinutes ?? prescription.cardio?.cooldownMinutes ?? 0,
  );
  const [talk, setTalk] = useState<Talk>(
    (session.cardioTalkTest as Talk) || "full_sentences",
  );
  const [rpe, setRpe] = useState(session.cardioRpe ?? 2);
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
    if (!clock || saveState === "saving" || blocked) return;
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

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg pb-48">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link href={`/workout/${workout.id}`} className="grid size-10 place-items-center" aria-label="Назад">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Цикл {cycle.number} — {cycle.name}</p>
          <b>{workout.title}</b>
        </div>
        <HeartRateBadge />
      </header>

      <div className="space-y-4 p-4">
        {blocked && (
          <section className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div><strong>Кардио заблокировано.</strong><p className="mt-1">Красный статус: не тренироваться и не разминаться «до нормы».</p></div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <small className="text-muted-foreground">ФАКТИЧЕСКОЕ ВРЕМЯ</small>
          <div className="font-mono text-6xl font-bold">{formatTime(elapsed)}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            План: {readinessPlan.min === readinessPlan.max ? readinessPlan.min : `${readinessPlan.min}–${readinessPlan.max}`} мин · {readinessPlan.zone ?? "отдых"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{readinessPlan.note}</p>
        </section>

        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <b>Главный ориентир — разговорный тест</b>
          <p className="mt-1 text-sm text-muted-foreground">
            Z1: свободный разговор. Z2: полные предложения, RPE 2–3/10. Если речь распадается на короткие фразы — снизьте сопротивление или перейдите в Z1. Пульс только справочный.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4">
          <Input label="Модальность" value={modality} set={setModality} />
          <Input label="Скорость" value={speed} set={setSpeed} />
          <Input label="Сопротивление" value={resistance} set={setResistance} />
          <div className="text-xs text-muted-foreground">
            Пульс
            <div className="mt-1 h-11 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground">
              {heartRate.bpm != null ? `${heartRate.bpm} уд/мин` : "не подключён"}
            </div>
          </div>
          <NumberInput label="Разминка, мин" value={warmupMinutes} set={setWarmupMinutes} />
          <NumberInput label="Основная Z1/Z2, мин" value={mainMinutes} set={setMainMinutes} />
          <NumberInput label="Заминка, мин" value={cooldownMinutes} set={setCooldownMinutes} />
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <b>Итог кардио</b>
          {([
            ["full_sentences", "Мог говорить полными предложениями"],
            ["short_phrases", "Только короткими фразами — темп был выше цели"],
            ["difficult", "Говорить было трудно — прекратить/снизить"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTalk(value)} className={`min-h-11 w-full rounded-lg border px-3 text-left text-sm ${talk === value ? "border-primary bg-primary/10" : "border-border"}`}>{label}</button>
          ))}
          <label className="block text-sm">Субъективная нагрузка: {rpe}/10
            <input type="range" min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} className="mt-2 w-full" />
          </label>
          <textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} placeholder="Симптомы: нет или опишите…" className="min-h-20 w-full rounded-lg border border-input bg-background p-3" />
        </section>

        {saveState !== "idle" && (
          <div className={`flex gap-2 rounded-lg p-3 text-sm ${saveState === "queued" ? "bg-warning/15 text-warning" : saveState === "error" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
            {saveState === "queued" ? <CloudOff className="size-4" /> : <CheckCircle2 className="size-4" />}
            {saveState === "saving" ? "Сохраняю…" : saveState === "saved" ? "Сохранено" : saveState === "queued" ? "Ждёт синхронизации" : "Ошибка сохранения"}
          </div>
        )}
      </div>

      {!readOnly && !blocked && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3">
          <div className="mx-auto flex max-w-lg gap-3">
            <Button variant="outline" className="flex-1" onClick={toggle}>
              {running ? <><Pause /> Пауза</> : <><Play /> {elapsed > 0 ? "Продолжить" : "Старт"}</>}
            </Button>
            <Button className="flex-[2]" onClick={finish} disabled={elapsed === 0}>
              <Square /> Завершить кардио
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function Input({ label, value, set }: { label: string; value: string; set: (value: string) => void }) {
  return <label className="text-xs text-muted-foreground">{label}<input value={value} onChange={(event) => set(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground" /></label>;
}
function NumberInput({ label, value, set }: { label: string; value: number; set: (value: number) => void }) {
  return <label className="text-xs text-muted-foreground">{label}<input type="number" min="0" max="180" value={value} onChange={(event) => set(Number(event.target.value))} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground" /></label>;
}
