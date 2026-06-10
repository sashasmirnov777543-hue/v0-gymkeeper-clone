"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Play } from "lucide-react"
import { startSession } from "@/app/actions/workout"
import { createLocalSession, findLocalSession } from "@/lib/offline"

export function StartWorkoutButton({
  workoutId,
  hasActive,
  activeSessionId,
}: {
  workoutId: number
  hasActive: boolean
  activeSessionId?: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    setBusy(true)
    // незаконченная офлайн-сессия этой тренировки? продолжаем её
    const localKey = findLocalSession(workoutId)
    if (localKey) {
      router.push(`/offline-session?key=${localKey}`)
      return
    }
    // активная серверная сессия: просто переходим к ней
    if (hasActive && activeSessionId != null) {
      router.push(`/session/${activeSessionId}`)
      return
    }
    try {
      await startSession(workoutId) // онлайн: server action сам сделает redirect
    } catch (err) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        // офлайн: создаём локальную сессию
        const key = createLocalSession(workoutId)
        router.push(`/offline-session?key=${key}`)
      } else if (err instanceof TypeError) {
        const key = createLocalSession(workoutId)
        router.push(`/offline-session?key=${key}`)
      } else {
        throw err
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      <Play className="size-5" aria-hidden="true" />
      {busy
        ? "Открываю..."
        : hasActive
          ? "Продолжить тренировку"
          : "Начать тренировку"}
    </button>
  )
}
