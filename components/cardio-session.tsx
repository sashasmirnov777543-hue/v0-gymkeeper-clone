"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { adjustedCardioMinutes, isMiniTaper } from "@/lib/training-logic";
import {
  elapsedSeconds,
  pauseClock,
  resumeClock,
  type CardioClock,
} from "@/lib/cardio-clock";
const ZONES = { Z1: [0.5, 0.6], Z2: [0.6, 0.7], Z3: [0.7, 0.8] } as const;
type Talk = "full_sentences" | "short_phrases" | "difficult";
type Save = "idle" | "saving" | "saved" | "queued" | "error";
function fmt(s: number) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
}
function zone(b: number, m: number) {
  const r = b / m;
  return r < 0.5
    ? "ниже"
    : r < 0.6
      ? "Z1"
      : r < 0.7
        ? "Z2"
        : r < 0.8
          ? "Z3"
          : "выше";
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
    cardioRpe?: number | null;
    cardioTalkTest?: string | null;
    cardioSymptoms?: string | null;
  };
  workout: {
    id: number;
    title: string;
    cardioZone: string | null;
    cardioMinutes: string | null;
  };
  cycle: { number: number; name: string };
  lastCardio?: unknown;
}) {
  const router = useRouter(),
    hr = useHeartRate(),
    readOnly = session.status !== "active";
  useWakeLock(!readOnly);
  const key = `gym:cardio-clock:${session.id}`;
  const [clock, setClock] = useState<CardioClock | null>(null),
    [now, setNow] = useState(Date.now()),
    [speed, setSpeed] = useState(session.speed ?? ""),
    [resistance, setResistance] = useState(session.resistance ?? ""),
    [talk, setTalk] = useState<Talk>(
      (session.cardioTalkTest as Talk) || "full_sentences",
    ),
    [rpe, setRpe] = useState(session.cardioRpe ?? 5),
    [symptoms, setSymptoms] = useState(session.cardioSymptoms ?? ""),
    [save, setSave] = useState<Save>("idle");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setClock(JSON.parse(raw));
      else {
        const c = {
          accumulatedMs:
            readOnly && session.durationSeconds != null
              ? session.durationSeconds * 1000
              : Math.max(0, Date.now() - new Date(session.startedAt).getTime()),
          runningSince: readOnly ? null : Date.now(),
        };
        setClock(c);
        localStorage.setItem(key, JSON.stringify(c));
      }
    } catch {
      setClock({
        accumulatedMs: 0,
        runningSince: readOnly ? null : Date.now(),
      });
    }
  }, [key, readOnly, session.startedAt, session.durationSeconds]);
  useEffect(() => {
    if (!clock) return;
    localStorage.setItem(key, JSON.stringify(clock));
    if (clock.runningSince == null) return;
    const t = setInterval(() => setNow(Date.now()), 500),
      v = () => setNow(Date.now());
    document.addEventListener("visibilitychange", v);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", v);
    };
  }, [clock, key]);
  const elapsed = useMemo(
      () => (clock ? elapsedSeconds(clock, now) : 0),
      [clock, now],
    ),
    running = clock?.runningSince != null,
    target = (workout.cardioZone?.match(/Z\d/)?.[0] ??
      "Z2") as keyof typeof ZONES,
    range = ZONES[target],
    current = hr.bpm != null ? zone(hr.bpm, 185) : null,
    planned = Number.parseInt(workout.cardioMinutes ?? "", 10),
    minutes = Number.isFinite(planned)
      ? adjustedCardioMinutes(planned, session.readinessLevel)
      : null;
  function toggle() {
    if (!clock) return;
    unlockAudio();
    const n = Date.now();
    setNow(n);
    setClock(
      clock.runningSince == null ? resumeClock(clock, n) : pauseClock(clock, n),
    );
  }
  async function finish() {
    if (!clock || save === "saving") return;
    const n = Date.now(),
      durationSeconds = elapsedSeconds(clock, n),
      data = {
        durationSeconds,
        avgHr: averageBpmSince(new Date(session.startedAt).getTime()),
        speed: speed.trim() || null,
        resistance: resistance.trim() || null,
        cardioRpe: rpe,
        cardioTalkTest: talk,
        cardioSymptoms: symptoms.trim() || null,
      };
    setClock({ accumulatedMs: durationSeconds * 1000, runningSince: null });
    setSave("saving");
    if (typeof session.id === "string") {
      finishLocalCardioSession(session.id, data);
      localStorage.removeItem(key);
      setSave("queued");
      setTimeout(() => router.push("/history"), 900);
      return;
    }
    try {
      await finishCardioSession({ sessionId: session.id, ...data });
      localStorage.removeItem(key);
      setSave("saved");
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        pushOp({
          kind: "cardioFinish",
          sessionRef: session.id,
          finishedAt: new Date(n).toISOString(),
          ...data,
        });
        localStorage.removeItem(key);
        setSave("queued");
      } else {
        setSave("error");
        return;
      }
    }
    setTimeout(() => router.push("/history"), 900);
  }
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg pb-28">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href={`/workout/${workout.id}`}
          className="grid size-10 place-items-center"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            Цикл {cycle.number} — {cycle.name}
          </p>
          <b>{workout.title}</b>
        </div>
        <HeartRateBadge />
      </header>
      <div className="flex flex-col gap-5 p-4">
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <small className="text-muted-foreground">ВРЕМЯ</small>
          <div className="font-mono text-6xl font-bold">{fmt(elapsed)}</div>
          {minutes != null && (
            <p className="text-sm text-muted-foreground">
              Цель: {minutes} мин · {workout.cardioZone}
              {isMiniTaper(session.readinessLevel) ? " · мини-тейпер" : ""}
            </p>
          )}
        </section>
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <b>Главный ориентир — разговорный тест</b>
          <p className="mt-1 text-sm text-muted-foreground">
            Сохраняйте возможность говорить целыми фразами. Пульс — только
            справочная оценка, особенно на фоне лекарств.
          </p>
        </section>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Скорость" value={speed} set={setSpeed} />
          <Input label="Сопротивление" value={resistance} set={setResistance} />
        </div>
        <section className="rounded-xl border border-border bg-card p-4">
          <b>Пульс — справочно</b>
          {hr.status === "connected" ? (
            <div className="mt-2">
              <span className="font-mono text-4xl font-bold">{hr.bpm}</span>{" "}
              <span className="text-muted-foreground">уд/мин · {current}</span>
              <p className="text-xs text-muted-foreground">
                Расчётный ориентир {Math.round(range[0] * 185)}–
                {Math.round(range[1] * 185)}. При расхождении ориентируйтесь на
                речь и симптомы.
              </p>
            </div>
          ) : (
            <Button variant="outline" className="mt-2" onClick={hr.connect}>
              Подключить пульс
            </Button>
          )}
        </section>
        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <b>Итог кардио</b>
          <div>
            {(
              [
                ["full_sentences", "Мог говорить целыми фразами"],
                ["short_phrases", "Только короткими фразами"],
                ["difficult", "Говорить было трудно"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTalk(v)}
                className={`mt-2 min-h-11 w-full rounded-lg border px-3 text-left text-sm ${talk === v ? "border-primary bg-primary/10" : "border-border"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="block">
            Субъективная нагрузка: {rpe}/10
            <input
              className="mt-2 w-full"
              type="range"
              min="1"
              max="10"
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
            />
          </label>
          <textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Симптомы: нет или опишите…"
            className="min-h-20 w-full rounded-lg border border-input bg-background p-3"
          />
        </section>
        {save !== "idle" && (
          <div
            className={`flex gap-2 rounded-lg p-3 ${save === "queued" ? "bg-warning/15 text-warning" : save === "error" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}
          >
            {save === "queued" ? (
              <CloudOff className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {save === "saving"
              ? "Сохраняю…"
              : save === "saved"
                ? "Сохранено"
                : save === "queued"
                  ? "Ждёт синхронизации"
                  : "Ошибка сохранения"}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-3">
          <div className="mx-auto flex max-w-lg gap-3">
            <Button variant="outline" className="flex-1" onClick={toggle}>
              {running ? (
                <>
                  <Pause />
                  Пауза
                </>
              ) : (
                <>
                  <Play />
                  Продолжить
                </>
              )}
            </Button>
            <Button className="flex-[2]" onClick={finish}>
              <Square />
              Завершить кардио
            </Button>
          </div>
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
  set: (v: string) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
      />
    </label>
  );
}
