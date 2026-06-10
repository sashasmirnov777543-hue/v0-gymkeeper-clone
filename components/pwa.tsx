"use client"

import { useEffect, useState } from "react"
import { CloudOff, RefreshCw } from "lucide-react"
import { cacheProgram, flushOutbox, getOutbox, loadProgram } from "@/lib/offline"

/**
 * PWA-обвязка: регистрирует service worker, кэширует программу для офлайна,
 * автоматически синхронизирует очередь операций и показывает статус офлайна.
 */
export function Pwa() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    // 1. Service worker (только в продакшене, чтобы не мешать HMR)
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
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

    const onOnline = () => {
      setOnline(true)
      sync()
    }
    const onOffline = () => setOnline(false)

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    window.addEventListener("gym:outbox-change", refreshPending)

    if (navigator.onLine) sync()

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("gym:outbox-change", refreshPending)
    }
  }, [])

  if (online && pending === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2">
      <div
        role="status"
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
          online
            ? "bg-secondary text-secondary-foreground"
            : "bg-warning/20 text-warning"
        }`}
      >
        {online ? (
          <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CloudOff className="size-3.5" aria-hidden="true" />
        )}
        {online
          ? `Синхронизация: ${pending} зап.`
          : pending > 0
            ? `Офлайн · ${pending} зап. ждут сети`
            : "Офлайн-режим"}
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
  const urls: string[] = ["/", "/history", "/stats", "/technique"]
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
