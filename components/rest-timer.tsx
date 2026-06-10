"use client"

import { useEffect, useRef, useState } from "react"
import { Heart, Minus, Plus, X } from "lucide-react"
import { useCountdown } from "@/lib/timers"
import { useHeartRate } from "@/lib/heart-rate"
import { hrBeep, startBeep, tickBeep, warnBeep } from "@/lib/sound"

const HR_THRESHOLD_KEY = "gym:hr-rest-threshold"

function fmt(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Полноэкранный таймер отдыха между подходами.
 * - звук + вибрация за 20 сек и в конце
 * - ручная коррекция ±15 сек
 * - «отдых по пульсу»: даёт сигнал, когда ЧСС опустилась ниже порога
 */
export function RestTimer({
  seconds,
  label,
  onClose,
}: {
  seconds: number
  label: string
  onClose: () => void
}) {
  const hr = useHeartRate()
  const [hrMode, setHrMode] = useState(false)
  const [threshold, setThreshold] = useState(110)
  const hrFiredRef = useRef(false)

  const { remaining, total, running, start, stop, adjust } = useCountdown({
    warnAt: 20,
    onWarn: warnBeep,
    onDone: startBeep,
  })

  useEffect(() => {
    const saved = Number(localStorage.getItem(HR_THRESHOLD_KEY))
    if (saved > 0) setThreshold(saved)
    start(seconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // отдых по пульсу: как только ЧСС <= порога — сигнал «можно начинать»
  useEffect(() => {
    if (!hrMode || hr.bpm == null || hrFiredRef.current) return
    if (hr.bpm <= threshold) {
      hrFiredRef.current = true
      hrBeep()
    }
  }, [hrMode, hr.bpm, threshold])

  const pct = total > 0 ? (remaining / total) * 100 : 0
  const hrReady = hrMode && hr.bpm != null && hr.bpm <= threshold

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => {
            stop()
            onClose()
          }}
          className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
          aria-label="Закрыть таймер"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* круговой индикатор */}
        <div className="relative flex size-64 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              className="stroke-secondary"
              strokeWidth="6"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              className={
                remaining <= 20 && running ? "stroke-primary" : "stroke-primary/70"
              }
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - pct / 100)}
              style={{ transition: "stroke-dashoffset 0.3s linear" }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span
              className={`font-mono text-6xl font-bold tabular-nums ${
                remaining === 0 ? "text-primary" : "text-foreground"
              }`}
            >
              {fmt(remaining)}
            </span>
            {remaining === 0 && (
              <span className="mt-1 text-sm font-semibold text-primary">
                Время! Следующий подход
              </span>
            )}
          </div>
        </div>

        {/* ручная коррекция */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              adjust(-15)
              tickBeep()
            }}
            className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            aria-label="Минус 15 секунд"
          >
            <Minus className="size-5" />
          </button>
          <span className="w-16 text-center text-sm text-muted-foreground">−15 / +15</span>
          <button
            type="button"
            onClick={() => {
              adjust(15)
              tickBeep()
            }}
            className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            aria-label="Плюс 15 секунд"
          >
            <Plus className="size-5" />
          </button>
        </div>

        {/* отдых по пульсу */}
        {hr.status === "connected" && (
          <div
            className={`w-full max-w-xs rounded-xl border px-4 py-3 ${
              hrReady ? "border-primary bg-primary/10" : "border-border bg-card"
            }`}
          >
            <label className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Heart
                  className={`size-4 ${hrReady ? "fill-primary text-primary" : "text-muted-foreground"}`}
                />
                Старт по пульсу
              </span>
              <input
                type="checkbox"
                checked={hrMode}
                onChange={(e) => {
                  setHrMode(e.target.checked)
                  hrFiredRef.current = false
                }}
                className="size-5 accent-primary"
              />
            </label>
            {hrMode && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  Сигнал при ЧСС ≤
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const v = Math.max(80, threshold - 5)
                      setThreshold(v)
                      localStorage.setItem(HR_THRESHOLD_KEY, String(v))
                      hrFiredRef.current = false
                    }}
                    className="flex size-8 items-center justify-center rounded-md bg-secondary"
                    aria-label="Уменьшить порог"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-16 text-center font-mono font-bold">
                    {threshold}
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                      уд
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const v = Math.min(160, threshold + 5)
                      setThreshold(v)
                      localStorage.setItem(HR_THRESHOLD_KEY, String(v))
                      hrFiredRef.current = false
                    }}
                    className="flex size-8 items-center justify-center rounded-md bg-secondary"
                    aria-label="Увеличить порог"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            )}
            {hrMode && (
              <p className="mt-2 text-center text-sm">
                Сейчас:{" "}
                <span
                  className={`font-mono font-bold ${hrReady ? "text-primary" : "text-foreground"}`}
                >
                  {hr.bpm ?? "—"} уд/мин
                </span>
                {hrReady && (
                  <span className="ml-2 font-semibold text-primary">
                    Готов!
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="px-6 pb-8">
        <button
          type="button"
          onClick={() => {
            stop()
            onClose()
          }}
          className="w-full rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground"
        >
          Пропустить отдых
        </button>
      </div>
    </div>
  )
}
