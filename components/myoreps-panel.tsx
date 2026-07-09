"use client";

import { useEffect, useMemo, useState } from "react";
import { TimerReset, Zap } from "lucide-react";
import {
  isMyorepsAllowed,
  isMyorepsEligible,
  MYOREPS_MAX_MINI_SETS,
  MYOREPS_MAX_REPS,
  MYOREPS_MIN_REPS,
  MYOREPS_REST_SECONDS,
  myorepsStopReason,
} from "@/lib/myoreps";

export function MyorepsPanel({
  exerciseName,
  block,
  cycleNumber,
  readOnly,
  readinessLevel,
}: {
  exerciseName: string;
  block: string;
  cycleNumber: number;
  readOnly: boolean;
  readinessLevel?: string | null;
}) {
  const eligible = isMyorepsEligible(exerciseName);
  const allowed =
    isMyorepsAllowed(block, cycleNumber) &&
    !["orange", "red"].includes(readinessLevel ?? "");
  const [open, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const [miniSets, setMiniSets] = useState(0);
  const [lastReps, setLastReps] = useState<number | null>(null);
  const [techniqueOk, setTechniqueOk] = useState(true);
  const [pain, setPain] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!endAt) return;
    const tick = () => {
      const value = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(value);
      if (value === 0) setEndAt(null);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endAt]);

  const stopReason = useMemo(
    () =>
      myorepsStopReason({
        miniSets,
        lastMiniSetReps: lastReps,
        techniqueOk,
        pain,
      }),
    [miniSets, lastReps, techniqueOk, pain],
  );

  if (!eligible) return null;

  const beginRest = () => {
    setRemaining(MYOREPS_REST_SECONDS);
    setEndAt(Date.now() + MYOREPS_REST_SECONDS * 1000);
  };

  const reset = () => {
    setActivated(false);
    setMiniSets(0);
    setLastReps(null);
    setTechniqueOk(true);
    setPain(false);
    setEndAt(null);
    setRemaining(0);
  };

  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
        onClick={() => setOpen((value) => !value)}
        disabled={readOnly}
      >
        <span className="flex items-center gap-2 font-semibold">
          <Zap className="size-4 text-primary" />
          Миорепсы
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Свернуть" : allowed ? "Открыть" : "Отключены в этом цикле"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {!allowed ? (
            <p className="rounded-md bg-secondary p-2 text-xs leading-relaxed">
              В AMRAP-циклах, разгрузке, пике и тесте миорепсы отключены ради
              свежести.
            </p>
          ) : (
            <>
              {!activated ? (
                <>
                  <p className="text-muted-foreground">
                    Выполни обычный активирующий подход до RIR 1–2. Не доводи
                    его до отказа.
                  </p>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-primary px-3 py-3 font-semibold text-primary-foreground"
                    onClick={() => {
                      setActivated(true);
                      beginRest();
                    }}
                  >
                    Активирующий подход завершён
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
                    <span>Мини-серии</span>
                    <strong>
                      {miniSets} / {MYOREPS_MAX_MINI_SETS}
                    </strong>
                  </div>

                  {endAt ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-lg font-bold text-primary-foreground">
                      <TimerReset className="size-5" />
                      {remaining} с
                    </div>
                  ) : stopReason ? (
                    <p className="rounded-md bg-destructive/10 p-3 font-medium text-destructive">
                      {stopReason}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-muted-foreground">
                        Выполни {MYOREPS_MIN_REPS}–{MYOREPS_MAX_REPS} чистых
                        повторов и запиши их обычной кнопкой подхода.
                      </p>
                      <label
                        className="block text-xs font-medium text-muted-foreground"
                        htmlFor="myoreps-reps"
                      >
                        Повторов в мини-серии
                      </label>
                      <input
                        id="myoreps-reps"
                        type="number"
                        min="0"
                        max="20"
                        inputMode="numeric"
                        value={lastReps ?? ""}
                        onChange={(event) =>
                          setLastReps(
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-lg font-semibold"
                      />
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="flex items-center gap-2 rounded-md border border-border p-2">
                          <input
                            type="checkbox"
                            checked={techniqueOk}
                            onChange={(event) =>
                              setTechniqueOk(event.target.checked)
                            }
                          />
                          Техника чистая
                        </label>
                        <label className="flex items-center gap-2 rounded-md border border-border p-2">
                          <input
                            type="checkbox"
                            checked={pain}
                            onChange={(event) => setPain(event.target.checked)}
                          />
                          Есть боль
                        </label>
                      </div>
                      <button
                        type="button"
                        className="w-full rounded-lg bg-primary px-3 py-3 font-semibold text-primary-foreground disabled:opacity-50"
                        disabled={
                          lastReps == null ||
                          lastReps < MYOREPS_MIN_REPS ||
                          !techniqueOk ||
                          pain
                        }
                        onClick={() => {
                          setMiniSets((value) => value + 1);
                          setLastReps(null);
                          beginRest();
                        }}
                      >
                        Мини-серия завершена
                      </button>
                    </div>
                  )}
                </>
              )}

              <button
                type="button"
                className="w-full text-xs text-muted-foreground"
                onClick={reset}
              >
                Сбросить протокол
              </button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Стоп раньше лимита при боли, раскачке, резком падении скорости
                или если получилось меньше 3 повторов.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
