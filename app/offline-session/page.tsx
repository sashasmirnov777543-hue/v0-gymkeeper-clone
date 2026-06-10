"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { SessionLogger } from "@/components/session-logger"
import {
  getLocalSession,
  loadLocalSets,
  loadProgram,
  type ProgramCache,
} from "@/lib/offline"

export default function OfflineSessionPage() {
  return (
    <Suspense fallback={<CenteredMessage text="Загрузка..." />}>
      <OfflineSession />
    </Suspense>
  )
}

function OfflineSession() {
  const searchParams = useSearchParams()
  const localKey = searchParams.get("key")
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready"
        program: ProgramCache
        workoutId: number
        startedAt: string
      }
  >({ status: "loading" })

  useEffect(() => {
    if (!localKey) {
      setState({ status: "error", message: "Сессия не указана." })
      return
    }
    const local = getLocalSession(localKey)
    if (!local) {
      setState({
        status: "error",
        message: "Локальная сессия не найдена — возможно, она уже синхронизирована.",
      })
      return
    }
    const program = loadProgram()
    if (!program) {
      setState({
        status: "error",
        message:
          "Программа ещё не сохранена для офлайна. Откройте приложение с интернетом один раз.",
      })
      return
    }
    setState({
      status: "ready",
      program,
      workoutId: local.workoutId,
      startedAt: local.startedAt,
    })
  }, [localKey])

  if (state.status === "loading") return <CenteredMessage text="Загрузка..." />
  if (state.status === "error")
    return <CenteredMessage text={state.message} showHome />

  const { program, workoutId, startedAt } = state
  let workout: ProgramCache["cycles"][number]["workouts"][number] | null = null
  let cycle: ProgramCache["cycles"][number] | null = null
  for (const c of program.cycles) {
    const w = c.workouts.find((w) => w.id === workoutId)
    if (w) {
      workout = w
      cycle = c
      break
    }
  }

  if (!workout || !cycle || !localKey) {
    return (
      <CenteredMessage
        text="Тренировка не найдена в офлайн-кэше."
        showHome
      />
    )
  }

  return (
    <SessionLogger
      session={{ id: 0, status: "active", startedAt }}
      workout={{ id: workout.id, title: workout.title }}
      cycle={{ number: cycle.number, name: cycle.name }}
      exercises={workout.exercises}
      initialSets={loadLocalSets(localKey)}
      lastSetsByName={program.lastSetsByName}
      offlineKey={localKey}
    />
  )
}

function CenteredMessage({
  text,
  showHome,
}: {
  text: string
  showHome?: boolean
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
        {text}
      </p>
      {showHome && (
        <Link
          href="/"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          На главную
        </Link>
      )}
    </main>
  )
}
