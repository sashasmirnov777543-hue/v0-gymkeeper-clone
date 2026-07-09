"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, X } from "lucide-react";
import { startSession } from "@/app/actions/workout";
import { createLocalSession, findLocalSession } from "@/lib/offline";
import {
  READINESS_TEXT,
  readinessLevel,
  type ReadinessInput,
} from "@/lib/training-logic";
const INITIAL: ReadinessInput = {
  sleepMinutes: 420,
  sleepQuality: 3,
  morningPulseDelta: 0,
  shoulderPain: 0,
  backPain: 0,
  energy: 3,
};
export function StartWorkoutButton({
  workoutId,
  workoutKind,
  hasActive,
  activeSessionId,
}: {
  workoutId: number;
  workoutKind: string;
  hasActive: boolean;
  activeSessionId?: number;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [data, setData] = useState(INITIAL);
  const level = readinessLevel(data);
  async function launch(readiness?: ReadinessInput) {
    setBusy(true);
    const local = findLocalSession(workoutId);
    if (local) {
      router.push(`/offline-session?key=${local}`);
      return;
    }
    try {
      await startSession(workoutId, readiness);
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        const key = createLocalSession(workoutId, readiness);
        router.push(`/offline-session?key=${key}`);
      } else throw e;
    } finally {
      setBusy(false);
    }
  }
  function click() {
    if (hasActive && activeSessionId)
      return router.push(`/session/${activeSessionId}`);
    if (workoutKind === "cardio") void launch();
    else setOpen(true);
  }
  return (
    <>
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg disabled:opacity-60"
      >
        <Play className="size-5" />
        {busy
          ? "Открываю..."
          : hasActive
            ? "Продолжить тренировку"
            : "Начать тренировку"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
              void launch(data);
            }}
            className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-primary">
                  Готовность
                </p>
                <h2 className="text-xl font-bold">Как вы сегодня?</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="size-10"
              >
                <X className="mx-auto size-5" />
              </button>
            </div>
            <Num
              label="Сон, минут"
              value={data.sleepMinutes}
              min={0}
              max={900}
              onChange={(v) => setData({ ...data, sleepMinutes: v })}
            />
            <Scale
              label="Качество сна"
              value={data.sleepQuality}
              max={5}
              onChange={(v) => setData({ ...data, sleepQuality: v })}
            />
            <Num
              label="Пульс к обычному, уд/мин"
              value={data.morningPulseDelta}
              min={-20}
              max={40}
              onChange={(v) => setData({ ...data, morningPulseDelta: v })}
            />
            <Scale
              label="Боль в плече"
              value={data.shoulderPain}
              max={10}
              zero
              onChange={(v) => setData({ ...data, shoulderPain: v })}
            />
            <Scale
              label="Боль в спине"
              value={data.backPain}
              max={10}
              zero
              onChange={(v) => setData({ ...data, backPain: v })}
            />
            <Scale
              label="Общая энергия"
              value={data.energy}
              max={5}
              onChange={(v) => setData({ ...data, energy: v })}
            />
            <div className={`mt-4 rounded-xl border p-3 readiness-${level}`}>
              <strong>{READINESS_TEXT[level].title}</strong>
              <p className="mt-1 text-sm text-muted-foreground">
                {READINESS_TEXT[level].action}
              </p>
            </div>
            <button className="mt-4 h-12 w-full rounded-lg bg-primary font-bold text-primary-foreground">
              Начать с учётом готовности
            </button>
          </form>
        </div>
      )}
    </>
  );
}
function Num({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-4 block text-sm font-medium">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3"
      />
    </label>
  );
}
function Scale({
  label,
  value,
  max,
  zero,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  zero?: boolean;
  onChange: (v: number) => void;
}) {
  const from = zero ? 0 : 1;
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">
        {label}: {value}
      </legend>
      <input
        className="mt-2 w-full accent-current"
        type="range"
        min={from}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{from}</span>
        <span>{max}</span>
      </div>
    </fieldset>
  );
}
