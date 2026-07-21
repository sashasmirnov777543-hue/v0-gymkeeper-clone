"use client"

import { useEffect, useState } from "react"
import { CloudOff, Download, RefreshCw } from "lucide-react"
import { cacheProgram, flushOutbox, getOutbox, loadProgram } from "@/lib/offline"
import { APP_VERSION, shortVersion } from "@/lib/version"

/**
 * PWA-обвязка: регистрирует service worker, кэширует программу для офлайна,
 * автоматически синхронизирует очередь операций и показывает статус офлайна.
 */
export function Pwa() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)

  useEffect(() => {
    // 1. Service worker (только в продакшене, чтобы не мешать HMR)
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`).then((registration) => {
        registration.update().catch(() => {})
        const detectWaiting = () => {
          if (registration.waiting) setAvailableVersion(APP_VERSION)
        }
        detectWaiting()
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setAvailableVersion(APP_VERSION)
            }
          })
        })
      }).catch(() => {})
    }

    setOnline(navigator.onLine)
    setPending(getOutbox().length)

    const refreshPending = () => setPending(getOutbox().length)

    const sync = async () => {
      // отправляем накопленное
      await flushOutbox()
      refreshPending()
      // обновляем офлайн-кэш программы
      try {
        const res = await fetch("/api/program")
        if (res.ok) {
          const data = await res.json()
          cacheProgram(data)
          prefetchPages(data)
        }
      } catch {
        // офлайн — попробуем позже
      }
    }

    const checkVersion = async () => {
      if (process.env.NODE_ENV !== "production") return
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { version?: string }
        if (data.version && data.version !== APP_VERSION) {
          setAvailableVersion(data.version)
        }
      } catch {}
    }

    const onOnline = () => {
      setOnline(true)
      sync()
    }
    const onOffline = () => setOnline(false)

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    window.addEventListener("gym:outbox-change", refreshPending)

    if (navigator.onLine) sync()
    checkVersion()
    const versionTimer = window.setInterval(checkVersion, 15 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === "visible") checkVersion()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("gym:outbox-change", refreshPending)
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(versionTimer)
    }
  }, [])

  const installUpdate = async () => {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" })
      navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_CACHES" })
    }
    window.setTimeout(() => window.location.reload(), 150)
  }

  if (online && pending === 0 && !availableVersion) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2">
      <div
        role="status"
        className={`pointer-events-auto flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg ${
          availableVersion
            ? "border-primary/40 bg-card text-card-foreground"
            : online
            ? "bg-secondary text-secondary-foreground"
            : "bg-warning/20 text-warning"
        }`}
      >
        {availableVersion ? (
          <Download className="size-4 text-primary" aria-hidden="true" />
        ) : online ? (
          <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CloudOff className="size-3.5" aria-hidden="true" />
        )}
        {availableVersion
          ? `Доступна версия ${shortVersion(availableVersion)}`
          : online
          ? `Синхронизация: ${pending} зап.`
          : pending > 0
            ? `Офлайн · ${pending} зап. ждут сети`
            : "Офлайн-режим"}
        {availableVersion && (
          <button
            type="button"
            onClick={installUpdate}
            className="ml-1 min-h-9 rounded-md bg-primary px-3 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Обновить
          </button>
        )}
      </div>
    </div>
  )
}

/** Прогревает кэш service worker всеми страницами тренировок */
function prefetchPages(data: { cycles?: { workouts?: { id: number }[] }[] }) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    return
  }
  // если кэш уже был — не качаем повторно
  const had = loadProgram() != null
  const urls: string[] = ["/", "/history", "/stats", "/technique", "/settings"]
  for (const c of data.cycles ?? []) {
    for (const w of c.workouts ?? []) {
      urls.push(`/workout/${w.id}`)
    }
  }
  // лёгкий последовательный прогрев, чтобы не душить сеть
  let i = 0
  const next = () => {
    if (i >= urls.length) return
    const url = urls[i++]
    fetch(url, { headers: { "x-prefetch": "1" } })
      .catch(() => {})
      .finally(() => setTimeout(next, had ? 400 : 150))
  }
  next()
}
