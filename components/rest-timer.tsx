"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, Check, ChevronDown, Heart, Minus, Plus, TrendingDown, TrendingUp, X } from "lucide-react"
import { useCountdown } from "@/lib/timers"
import { useHeartRate } from "@/lib/heart-rate"
import { hrBeep, startBeep, tickBeep, warnBeep } from "@/lib/sound"
import type { Recommendation } from "@/lib/recommend"
import {
  closeRestNotifications,
  ensureNotificationPermission,
  getRestNotifySetting,
  ensurePushReady,
  notificationsSupported,
  scheduleRestEndNotification,
  sendTestNotification,
  setRestNotifySetting,
} from "@/lib/notifications"

const HR_THRESHOLD_KEY = "gym:hr-rest-threshold"

function fmt(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Таймер отдыха между подходами (полный экран или свёрнутый в плашку).
 * - звук + вибрация за 20 сек и в конце
 * - ручная коррекция ±15 сек
 * - сворачивается в компактную плашку, чтобы видеть рекомендации и историю
 * - показывает рекомендацию на следующий подход прямо на экране таймера
 * - «отдых по пульсу»: даёт сигнал, когда ЧСС опустилась ниже порога
 */
export function RestTimer({
  seconds,
  label,
  recommendation,
  onClose,
}: {
  seconds: number
  label: string
  recommendation?: Recommendation
  onClose: () => void
}) {
  const hr = useHeartRate()
  const [hrMode, setHrMode] = useState(false)
  const [threshold, setThreshold] = useState(110)
  const [minimized, setMinimized] = useState(false)
  const [notify, setNotify] = useState(false)
  const [testPending, setTestPending] = useState(false)
  const hrFiredRef = useRef(false)

  const { remaining, total, running, endAt, start, stop, adjust } = useCountdown({
    warnAt: 20,
    onWarn: warnBeep,
    onDone: startBeep,
  })

  useEffect(() => {
    const saved = Number(localStorage.getItem(HR_THRESHOLD_KEY))
    if (saved > 0) setThreshold(saved)
    setNotify(
      getRestNotifySetting() &&
        notificationsSupported() &&
        Notification.permission === "granted",
    )
    // новый отдых — убираем уведомление от предыдущего
    closeRestNotifications()
    start(seconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // уведомление в конце отдыха (телефон + зеркало на часы);
  // перепланируется при коррекции ±15 сек, отменяется при закрытии таймера
  useEffect(() => {
    if (!notify || !endAt || endAt <= Date.now()) return
    const body = recommendation
      ? `${label}: ${recommendation.weight} кг — ${recommendation.reason}`
      : label
    return scheduleRestEndNotification(endAt, body)
  }, [notify, endAt, recommendation, label])

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

  // свёрнутый режим: компактная плашка над нижней панелью, контент виден
  if (minimized) {
    return (
      <div className="fixed bottom-20 right-4 z-50 flex items-center gap-1 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-lg">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 py-1"
          aria-label="Развернуть таймер отдыха"
        >
          <span
            className={`font-mono text-lg font-bold tabular-nums ${
              remaining === 0 ? "text-primary" : "text-foreground"
            }`}
          >
            {fmt(remaining)}
          </span>
          <span className="pr-1 text-xs text-muted-foreground">
            {remaining === 0 ? "Время!" : "отдых"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            stop()
            onClose()
          }}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Закрыть таймер"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
            aria-label="Свернуть таймер"
          >
            <ChevronDown className="size-5" />
          </button>
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

        {/* рекомендация на следующий подход — видна прямо на таймере */}
        {recommendation && (
          <div
            className={`flex w-full max-w-xs items-center gap-2 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              recommendation.direction === "up"
                ? "border-success/40 bg-success/10 text-success"
                : recommendation.direction === "down"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border bg-card text-foreground"
            }`}
          >
            {recommendation.direction === "up" ? (
              <TrendingUp className="size-4 shrink-0" />
            ) : recommendation.direction === "down" ? (
              <TrendingDown className="size-4 shrink-0" />
            ) : (
              <Check className="size-4 shrink-0" />
            )}
            <span>
              Следующий подход:{" "}
              <strong className="font-semibold">{recommendation.weight} кг</strong>
              {" — "}
              {recommendation.reason}
            </span>
          </div>
        )}

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

        {/* уведомление на телефон/часы в конце отдыха */}
        {notificationsSupported() && (
          <label className="flex w-full max-w-xs items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Bell
                className={`size-4 ${notify ? "text-primary" : "text-muted-foreground"}`}
              />
              Уведомление на часы
            </span>
            <input
              type="checkbox"
              checked={notify}
              onChange={async (e) => {
                const on = e.target.checked
                if (on) {
                  const ok = await ensureNotificationPermission()
                  setNotify(ok)
                  setRestNotifySetting(ok)
                  if (ok) void ensurePushReady()
                  if (!ok) {
                    alert(
                      "Уведомления запрещены для приложения. Разреши их в настройках браузера/системы и включи синхронизацию уведомлений в Huawei Health (или приложении твоих часов).",
                    )
                  }
                } else {
                  setNotify(false)
                  setRestNotifySetting(false)
                }
              }}
              className="size-5 accent-primary"
            />
          </label>
        )}

        {/* тест связки телефон → часы */}
        {notify && (
          <button
            type="button"
            onClick={async () => {
              if (!(await ensureNotificationPermission())) {
                alert("Уведомления запрещены — разреши их в настройках Chrome.")
                return
              }
              sendTestNotification(10_000)
              setTestPending(true)
              window.setTimeout(() => setTestPending(false), 12_000)
            }}
            disabled={testPending}
            className="w-full max-w-xs rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground active:scale-95 disabled:opacity-60"
          >
            {testPending
              ? "Заблокируй телефон — уведомление через 10 сек…"
              : "Тест: проверить уведомление на часах"}
          </button>
        )}

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
