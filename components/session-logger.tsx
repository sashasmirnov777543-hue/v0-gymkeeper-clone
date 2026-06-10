"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, ChevronDown, Minus, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExerciseGuideButton } from "@/components/exercise-guide-sheet"
import { cancelSession, deleteSet, finishSession, logSet } from "@/app/actions/workout"
import {
  cancelLocalSession,
  finishLocalSession,
  pushOp,
  saveLocalSets,
} from "@/lib/offline"
import {
  parsePrescribedWeight,
  recommendWeight,
  type LoggedSetLite,
  type Recommendation,
} from "@/lib/recommend"

type Exercise = {
  id: number
  name: string
  weightText: string | null
  targetReps: string | null
  targetSets: string | null
  targetRirMin: number | null
  targetRirMax: number | null
  comment: string | null
}

type SetRow = {
  id: number
  workoutExerciseId: number
  setNumber: number
  weight: number | null
  reps: number | null
  rir: number | null
}

export function SessionLogger({
  session,
  workout,
  cycle,
  exercises,
  initialSets,
  lastSetsByName,
  offlineKey,
}: {
  session: { id: number; status: string; startedAt: string }
  workout: { id: number; title: string }
  cycle: { number: number; name: string }
  exercises: Exercise[]
  initialSets: SetRow[]
  lastSetsByName: Record<string, LoggedSetLite[]>
  /** Ключ локальной (офлайн) сессии — все операции идут в очередь синхронизации */
  offlineKey?: string
}) {
  const router = useRouter()
  const [sets, setSets] = useState<SetRow[]>(initialSets)
  const [openId, setOpenId] = useState<number | null>(
    exercises.find((e) => e.weightText || e.targetReps)?.id ?? null,
  )
  const [isPending, startTransition] = useTransition()
  const readOnly = session.status !== "active"

  // ссылка на сессию для очереди: локальный ключ или реальный id
  const sessionRef: number | string = offlineKey ?? session.id

  const persistLocal = (next: SetRow[]) => {
    if (offlineKey) saveLocalSets(offlineKey, next)
  }

  const handleFinish = () => {
    if (offlineKey) {
      finishLocalSession(offlineKey)
      router.push("/history")
      return
    }
    startTransition(async () => {
      try {
        await finishSession(session.id)
      } catch (err) {
        // офлайн: ставим в очередь и уходим
        if (isOffline(err)) {
          pushOp({
            kind: "finish",
            sessionRef,
            finishedAt: new Date().toISOString(),
          })
          router.push("/history")
        } else {
          throw err
        }
      }
    })
  }

  const handleCancel = () => {
    if (offlineKey) {
      cancelLocalSession(offlineKey)
      router.push("/")
      return
    }
    startTransition(async () => {
      try {
        await cancelSession(session.id)
      } catch (err) {
        if (isOffline(err)) {
          pushOp({ kind: "cancel", sessionRef })
          router.push("/")
        } else {
          throw err
        }
      }
    })
  }

  const setsByExercise = useMemo(() => {
    const map: Record<number, SetRow[]> = {}
    for (const s of sets) {
      ;(map[s.workoutExerciseId] ??= []).push(s)
    }
    return map
  }, [sets])

  const totalLogged = sets.length

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-32">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href={`/workout/${workout.id}`}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
            aria-label="Назад к тренировке"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              Цикл {cycle.number} — {cycle.name}
            </p>
            <h1 className="truncate text-base font-semibold">{workout.title}</h1>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            {totalLogged} подх.
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 py-4">
        {exercises.map((ex) => {
          const done = setsByExercise[ex.id] ?? []
          const lastTime = lastSetsByName[ex.name] ?? []
          const isOpen = openId === ex.id
          return (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              doneSets={done}
              lastTimeSets={lastTime}
              isOpen={isOpen}
              readOnly={readOnly}
              onToggle={() => setOpenId(isOpen ? null : ex.id)}
              onLogged={(row) =>
                setSets((prev) => {
                  const next = [...prev, row]
                  persistLocal(next)
                  return next
                })
              }
              onReplaceId={(tempId, realId) =>
                setSets((prev) =>
                  prev.map((s) => (s.id === tempId ? { ...s, id: realId } : s)),
                )
              }
              onDeleted={(setId) =>
                setSets((prev) => {
                  const next = prev.filter((s) => s.id !== setId)
                  persistLocal(next)
                  return next
                })
              }
              sessionRef={sessionRef}
              offline={Boolean(offlineKey)}
            />
          )
        })}
      </div>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-lg gap-3 px-4 py-3">
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              disabled={isPending}
              onClick={() => {
                if (confirm("Отменить тренировку? Все записанные подходы будут удалены.")) {
                  handleCancel()
                }
              }}
            >
              Отменить
            </Button>
            <Button
              className="flex-[2]"
              disabled={isPending || totalLogged === 0}
              onClick={handleFinish}
            >
              <Check className="size-4" />
              Завершить тренировку
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}

function ExerciseCard({
  exercise,
  doneSets,
  lastTimeSets,
  isOpen,
  readOnly,
  onToggle,
  onLogged,
  onReplaceId,
  onDeleted,
  sessionRef,
  offline,
}: {
  exercise: Exercise
  doneSets: SetRow[]
  lastTimeSets: LoggedSetLite[]
  isOpen: boolean
  readOnly: boolean
  onToggle: () => void
  onLogged: (row: SetRow) => void
  onReplaceId: (tempId: number, realId: number) => void
  onDeleted: (setId: number) => void
  sessionRef: number | string
  offline: boolean
}) {
  const prescribed = parsePrescribedWeight(exercise.weightText)

  // Рекомендация: сперва по подходам ТЕКУЩЕЙ сессии, иначе по прошлой тренировке
  const rec: Recommendation = useMemo(() => {
    const current: LoggedSetLite[] = doneSets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      rir: s.rir,
    }))
    const source = current.some((s) => s.rir != null && s.weight != null)
      ? current
      : lastTimeSets
    return recommendWeight(
      source,
      exercise.targetRirMin,
      exercise.targetRirMax,
      prescribed,
    )
  }, [doneSets, lastTimeSets, exercise.targetRirMin, exercise.targetRirMax, prescribed])

  const hasTargets = exercise.weightText || exercise.targetReps

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-1 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
          aria-expanded={isOpen}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-snug text-pretty">
              {exercise.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[
                exercise.weightText,
                exercise.targetReps && `${exercise.targetReps} повт.`,
                exercise.targetSets && `${exercise.targetSets} подх.`,
                exercise.targetRirMin != null &&
                  `RIR ${exercise.targetRirMin}${exercise.targetRirMax != null && exercise.targetRirMax !== exercise.targetRirMin ? `–${exercise.targetRirMax}` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Без параметров"}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {doneSets.length > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                {doneSets.length}
              </span>
            )}
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
        </button>
        <ExerciseGuideButton exerciseName={exercise.name} />
      </div>

      {isOpen && (
        <div className="border-t border-border px-4 py-3">
          {exercise.comment && (
            <p className="mb-3 rounded-md bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
              {exercise.comment}
            </p>
          )}

          {rec && hasTargets && (
            <div
              className={`mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs leading-relaxed ${
                rec.direction === "up"
                  ? "bg-success/15 text-success"
                  : rec.direction === "down"
                    ? "bg-warning/15 text-warning"
                    : "bg-secondary text-secondary-foreground"
              }`}
            >
              {rec.direction === "up" ? (
                <TrendingUp className="size-4 shrink-0" />
              ) : rec.direction === "down" ? (
                <TrendingDown className="size-4 shrink-0" />
              ) : (
                <Check className="size-4 shrink-0" />
              )}
              <span>
                <strong className="font-semibold">{rec.weight} кг</strong> — {rec.reason}
              </span>
            </div>
          )}

          {doneSets.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {doneSets.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span className="font-medium">
                    {s.weight != null ? `${s.weight} кг` : "—"} × {s.reps ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    RIR {s.rir ?? "—"}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Удалить подход ${i + 1}`}
                      onClick={() => {
                        onDeleted(s.id)
                        // временные id (< 0) ещё не существуют на сервере
                        if (offline || s.id < 0) return
                        deleteSet(s.id, typeof sessionRef === "number" ? sessionRef : 0).catch(
                          (err) => {
                            if (isOffline(err)) {
                              pushOp({ kind: "deleteSet", setId: s.id })
                            }
                          },
                        )
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!readOnly && (
            <SetForm
              key={doneSets.length}
              defaultWeight={rec?.weight ?? prescribed}
              targetRirMin={exercise.targetRirMin}
              onSubmit={async (weight, reps, rir) => {
                const tempId = -Date.now()
                const setNumber = doneSets.length + 1
                const row: SetRow = {
                  id: tempId,
                  workoutExerciseId: exercise.id,
                  setNumber,
                  weight,
                  reps,
                  rir,
                }
                onLogged(row)

                // офлайн-сессия: только очередь, без сервера
                if (offline || typeof sessionRef === "string") {
                  pushOp({
                    kind: "set",
                    sessionRef,
                    workoutExerciseId: exercise.id,
                    setNumber,
                    weight,
                    reps,
                    rir,
                  })
                  return
                }

                try {
                  const inserted = await logSet({
                    sessionId: sessionRef,
                    workoutExerciseId: exercise.id,
                    setNumber,
                    weight,
                    reps,
                    rir,
                  })
                  if (inserted?.id != null) onReplaceId(tempId, inserted.id)
                } catch (err) {
                  // сеть пропала посреди тренировки: ставим в очередь
                  if (isOffline(err)) {
                    pushOp({
                      kind: "set",
                      sessionRef,
                      workoutExerciseId: exercise.id,
                      setNumber,
                      weight,
                      reps,
                      rir,
                    })
                  } else {
                    throw err
                  }
                }
              }}
            />
          )}
        </div>
      )}
    </section>
  )
}

/** Ошибка вызвана отсутствием сети (а не логикой сервера)? */
function isOffline(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  return err instanceof TypeError
}

function SetForm({
  defaultWeight,
  targetRirMin,
  onSubmit,
}: {
  defaultWeight: number | null
  targetRirMin: number | null
  onSubmit: (weight: number | null, reps: number | null, rir: number | null) => Promise<void>
}) {
  const [weight, setWeight] = useState<string>(
    defaultWeight != null ? String(defaultWeight) : "",
  )
  const [reps, setReps] = useState<string>("")
  const [rir, setRir] = useState<number | null>(targetRirMin)
  const [saving, setSaving] = useState(false)

  const bump = (delta: number) => {
    const cur = Number.parseFloat(weight.replace(",", ".")) || 0
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10)
    setWeight(String(next))
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setSaving(true)
        const w = weight.trim() ? Number.parseFloat(weight.replace(",", ".")) : null
        const r = reps.trim() ? Number.parseInt(reps, 10) : null
        await onSubmit(Number.isNaN(w as number) ? null : w, Number.isNaN(r as number) ? null : r, rir)
        setSaving(false)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`w-${targetRirMin}-weight`} className="text-xs text-muted-foreground">
            Вес, кг
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => bump(-2.5)}
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
              aria-label="Минус 2.5 кг"
            >
              <Minus className="size-4" />
            </button>
            <input
              id={`w-${targetRirMin}-weight`}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-center text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="0"
            />
            <button
              type="button"
              onClick={() => bump(2.5)}
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
              aria-label="Плюс 2.5 кг"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`w-${targetRirMin}-reps`} className="text-xs text-muted-foreground">
            Повторения
          </label>
          <input
            id={`w-${targetRirMin}-reps`}
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-center text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="0"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          Сколько осталось до отказа (RIR)?
        </span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="RIR">
          {[0, 1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={rir === v}
              onClick={() => setRir(rir === v ? null : v)}
              className={`h-10 flex-1 rounded-md border text-sm font-semibold transition-colors ${
                rir === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={saving} className="h-11 w-full">
        {saving ? "Сохраняю..." : "Записать подход"}
      </Button>
    </form>
  )
}
