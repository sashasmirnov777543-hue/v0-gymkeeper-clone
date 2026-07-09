"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeartRateBadge } from "@/components/heart-rate";
import { useHeartRate, useWakeLock, averageBpmSince } from "@/lib/heart-rate";
import { finishCardioSession } from "@/app/actions/workout";
import { hrBeep, unlockAudio } from "@/lib/sound";
import { adjustedCardioMinutes, isMiniTaper } from "@/lib/training-logic";

const MAXHR_KEY = "gym:max-hr";

/** Границы пульсовых зон в % от макс. ЧСС */
const ZONES = {
  Z1: [0.5, 0.6],
  Z2: [0.6, 0.7],
  Z3: [0.7, 0.8],
} as const;

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Какая зона у текущего пульса */
function zoneOf(
  bpm: number,
  maxHr: number,
): "ниже" | "Z1" | "Z2" | "Z3" | "выше" {
  const r = bpm / maxHr;
  if (r < ZONES.Z1[0]) return "ниже";
  if (r < ZONES.Z1[1]) return "Z1";
  if (r < ZONES.Z2[1]) return "Z2";
  if (r < ZONES.Z3[1]) return "Z3";
  return "выше";
}

export function CardioSession({
  session,
  workout,
  cycle,
  lastCardio,
}: {
  session: {
    id: number;
    status: string;
    speed?: string | null;
    resistance?: string | null;
    readinessLevel?: string | null;
  };
  workout: {
    id: number;
    title: string;
    cardioZone: string | null;
    cardioMinutes: string | null;
  };
  cycle: { number: number; name: string };
  lastCardio?: {
    speed: string | null;
    resistance: string | null;
    durationSeconds: number | null;
    startedAt: string;
  } | null;
}) {
  const router = useRouter();
  const hr = useHeartRate();
  const readOnly = session.status !== "active";
  useWakeLock(!readOnly);

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [maxHr, setMaxHr] = useState(185);
  const [speed, setSpeed] = useState(session.speed ?? "");
  const [resistance, setResistance] = useState(session.resistance ?? "");
  const startedAtRef = useRef<number>(Date.now());
  const lastZoneWarnRef = useRef<number>(0);

  // целевая зона из плана (берём первую, напр. "Z2" из "Z1–Z2")
  const targetZone = (workout.cardioZone?.match(/Z\d/)?.[0] ??
    "Z2") as keyof typeof ZONES;
  const targetRange = ZONES[targetZone] ?? ZONES.Z2;
  const targetLow = Math.round(targetRange[0] * maxHr);
  const targetHigh = Math.round(targetRange[1] * maxHr);
  const plannedMinutes = Number.parseInt(workout.cardioMinutes ?? "", 10);
  const adjustedMinutes = Number.isFinite(plannedMinutes)
    ? adjustedCardioMinutes(plannedMinutes, session.readinessLevel)
    : null;

  useEffect(() => {
    const saved = Number(localStorage.getItem(MAXHR_KEY));
    if (saved > 0) setMaxHr(saved);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // звук, если вышли из целевой зоны (не чаще раза в 25 сек)
  useEffect(() => {
    if (hr.bpm == null || !running) return;
    const z = zoneOf(hr.bpm, maxHr);
    const outOfZone = z !== targetZone && !(targetZone === "Z1" && z === "Z2");
    if (outOfZone && Date.now() - lastZoneWarnRef.current > 25000) {
      lastZoneWarnRef.current = Date.now();
      hrBeep();
    }
  }, [hr.bpm, running, maxHr, targetZone]);

  const currentZone = hr.bpm != null ? zoneOf(hr.bpm, maxHr) : null;
  const inZone =
    currentZone === targetZone || (targetZone === "Z1" && currentZone === "Z2");

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    setRunning(false);
    const avg = averageBpmSince(startedAtRef.current);
    try {
      await finishCardioSession({
        sessionId: session.id,
        durationSeconds: elapsed,
        avgHr: avg,
        speed: speed.trim() || null,
        resistance: resistance.trim() || null,
      });
    } catch {
      // офлайн — всё равно уходим, серверная запись не критична для кардио
    }
    router.push("/history");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href={`/workout/${workout.id}`}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          aria-label="Назад"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Цикл {cycle.number} — {cycle.name}
          </p>
          <h1 className="truncate text-base font-semibold">{workout.title}</h1>
        </div>
        <HeartRateBadge />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8">
        {/* секундомер */}
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Время
          </span>
          <span className="font-mono text-6xl font-bold tabular-nums">
            {fmt(elapsed)}
          </span>
          {workout.cardioMinutes && workout.cardioMinutes !== "—" && (
            <span className="mt-1 text-sm text-muted-foreground">
              Цель: {adjustedMinutes ?? workout.cardioMinutes} мин ·{" "}
              {workout.cardioZone}
              {isMiniTaper(session.readinessLevel) ? " · мини-тейпер" : ""}
            </span>
          )}
        </div>

        {/* скорость и сопротивление */}
        <div className="w-full max-w-xs">
          {lastCardio &&
          (lastCardio.speed ||
            lastCardio.resistance ||
            lastCardio.durationSeconds) ? (
            <div className="mb-3 rounded-xl border border-border bg-card px-4 py-2.5">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Прошлая тренировка
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>
                  Скорость:{" "}
                  <span className="font-semibold">
                    {lastCardio.speed || "—"}
                  </span>
                </span>
                <span>
                  Сопротивление:{" "}
                  <span className="font-semibold">
                    {lastCardio.resistance || "—"}
                  </span>
                </span>
                {lastCardio.durationSeconds ? (
                  <span className="text-muted-foreground">
                    {fmt(lastCardio.durationSeconds)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {readOnly ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Скорость</p>
                <p className="mt-0.5 font-mono text-lg font-semibold">
                  {session.speed || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Сопротивление</p>
                <p className="mt-0.5 font-mono text-lg font-semibold">
                  {session.resistance || "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cardio-speed"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Скорость
                </label>
                <input
                  id="cardio-speed"
                  inputMode="decimal"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  placeholder="напр. 10"
                  className="h-12 w-full rounded-xl border border-input bg-transparent px-3 text-center text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cardio-resistance"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Сопротивление
                </label>
                <input
                  id="cardio-resistance"
                  inputMode="decimal"
                  value={resistance}
                  onChange={(e) => setResistance(e.target.value)}
                  placeholder="напр. 8"
                  className="h-12 w-full rounded-xl border border-input bg-transparent px-3 text-center text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        {/* зона пульса */}
        {hr.status === "connected" ? (
          <div
            className={`flex w-full max-w-xs flex-col items-center gap-1 rounded-2xl border-2 px-6 py-5 ${
              inZone
                ? "border-success bg-success/10"
                : currentZone === "выше" || currentZone === "Z3"
                  ? "border-warning bg-warning/10"
                  : "border-border bg-card"
            }`}
          >
            <span className="font-mono text-5xl font-bold">
              {hr.bpm ?? "—"}
            </span>
            <span className="text-sm text-muted-foreground">уд/мин</span>
            <span
              className={`mt-1 rounded-full px-3 py-0.5 text-sm font-bold ${
                inZone
                  ? "bg-success text-background"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {currentZone === "ниже"
                ? "Ниже зоны — ускорься"
                : currentZone === "выше"
                  ? "Выше зоны — сбавь"
                  : `Зона ${currentZone}`}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              Цель {targetZone}: {targetLow}–{targetHigh} уд/мин
            </span>
          </div>
        ) : (
          <div className="flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-5 text-center">
            <p className="text-sm text-muted-foreground text-pretty">
              Подключите пульс с часов, чтобы видеть зону и получать сигнал при
              выходе из неё
            </p>
            <Button variant="outline" size="sm" onClick={hr.connect}>
              Подключить пульс
            </Button>
          </div>
        )}

        {/* настройка макс. ЧСС */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Макс. ЧСС:</span>
          <button
            type="button"
            onClick={() => {
              const v = Math.max(140, maxHr - 1);
              setMaxHr(v);
              localStorage.setItem(MAXHR_KEY, String(v));
            }}
            className="flex size-7 items-center justify-center rounded-md bg-secondary"
            aria-label="Уменьшить макс. ЧСС"
          >
            −
          </button>
          <span className="w-10 text-center font-mono font-bold text-foreground">
            {maxHr}
          </span>
          <button
            type="button"
            onClick={() => {
              const v = Math.min(210, maxHr + 1);
              setMaxHr(v);
              localStorage.setItem(MAXHR_KEY, String(v));
            }}
            className="flex size-7 items-center justify-center rounded-md bg-secondary"
            aria-label="Увеличить макс. ЧСС"
          >
            +
          </button>
        </div>
      </div>

      {!readOnly && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              disabled={finishing}
              onClick={() => {
                unlockAudio();
                setRunning((r) => !r);
              }}
            >
              {running ? (
                <>
                  <Pause className="size-4" /> Пауза
                </>
              ) : (
                <>
                  <Play className="size-4" /> Продолжить
                </>
              )}
            </Button>
            <Button
              className="flex-[2]"
              onClick={handleFinish}
              disabled={finishing}
            >
              <Square className="size-4" />
              {finishing ? "Завершаю…" : "Завершить кардио"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
