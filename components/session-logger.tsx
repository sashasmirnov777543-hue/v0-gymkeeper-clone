"use client"

// feat: пошаговый режим — одно упражнение на экран (редизайн)

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  History,
  Minus,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExerciseGuideButton } from "@/components/exercise-guide-sheet"
import { ExerciseHistory } from "@/components/exercise-history"
import { HeartRateBadge } from "@/components/heart-rate"
import { RestTimer } from "@/components/rest-timer"
import { SessionNotes } from "@/components/session-notes"
import { WarmupPlates } from "@/components/warmup-plates"
import { useWakeLock } from "@/lib/heart-rate"
import { unlockAudio } from "@/lib/sound"
import {
  cancelSession,
  deleteSet,
  finishSession,
  logSet,
  updateSet,
} from "@/app/actions/workout"
import {
  cancelLocalSession,
  finishLocalSession,
  pushOp,
  saveLocalSets,
} from "@/lib/offline"
import {
  isPercentPrescribed,
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
  restSeconds: number | null
  tempo?: string | null
}

type SetRow = {
  id: number
  workoutExerciseId: number
  setNumber: number
  weight: number | null
  reps: number | null
  rir: number | null
}

function fmtRest(sec: number): string {
  if (sec < 60) return `${sec} с`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} мин ${s} с` : `${m} мин`
}

function parseFirstInt(text: string | null): number | null {
  if (!text) return null
  const m = text.match(/\d+/)
  return m ? Number.parseInt(m[0], 10) : null
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-pretty font-mono text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  )
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
  session: { id: number; status: string; startedAt: string; notes?: string | null }
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
  const [idx, setIdx] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [rest, setRest] = useState<{
    seconds: number
    label: string
    rec: Recommendation
  } | null>(null)
  const readOnly = session.status !== "active"

  // экран не гаснет, пока тренировка активна
  useWakeLock(!readOnly)

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
  const safeIdx = Math.min(Math.max(idx, 0), Math.max(0, exercises.length - 1))
  const current = exercises[safeIdx]
  const isFirst = safeIdx <= 0
  const isLast = safeIdx >= exercises.length - 1

  const goPrev = () => setIdx((i) => Math.max(0, i - 1))
  const goNext = () => setIdx((i) => Math.min(exercises.length - 1, i + 1))

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-36">
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
          <HeartRateBadge />
        </div>
        {exercises.length > 1 && (
          <div className="mt-2 flex items-center gap-1" aria-hidden="true">
            {exercises.map((ex, i) => {
              const has = (setsByExercise[ex.id]?.length ?? 0) > 0
              return (
                <span
                  key={ex.id}
                  className={`h-1.5 flex-1 rounded-full ${
                    i === safeIdx
                      ? "bg-primary"
                      : has
                        ? "bg-primary/40"
                        : "bg-secondary"
                  }`}
                />
              )
            })}
          </div>
        )}
      </header>

      {current ? (
        <CurrentExercise
          key={current.id}
          exercise={current}
          position={safeIdx + 1}
          total={exercises.length}
          doneSets={setsByExercise[current.id] ?? []}
          lastTimeSets={lastSetsByName[current.name] ?? []}
          readOnly={readOnly}
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
          onUpdated={(setId, weight, reps, rir) =>
            setSets((prev) => {
              const next = prev.map((s) =>
                s.id === setId ? { ...s, weight, reps, rir } : s,
              )
              persistLocal(next)
              return next
            })
          }
          sessionRef={sessionRef}
          offline={Boolean(offlineKey)}
          onRest={(seconds, label, rec) => setRest({ seconds, label, rec })}
          onAdvance={isLast ? undefined : goNext}
        />
      ) : (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          В этой тренировке нет упражнений.
        </div>
      )}

      {!offlineKey && isLast && (
        <div className="px-4 pb-2">
          <SessionNotes
            sessionId={session.id}
            initialNotes={session.notes ?? null}
            readOnly={readOnly}
          />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-lg px-4 py-3">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              disabled={isFirst}
              onClick={goPrev}
            >
              <ArrowLeft className="size-4" />
              Назад
            </Button>
            {readOnly ? (
              isLast ? (
                <Button render={<Link href="/history" />} className="flex-[2]">
                  <History className="size-4" />
                  К истории
                </Button>
              ) : (
                <Button className="flex-[2]" onClick={goNext}>
                  Следующее упражнение
                  <ArrowRight className="size-4" />
                </Button>
              )
            ) : isLast ? (
              <Button
                className="flex-[2]"
                disabled={isPending || totalLogged === 0}
                onClick={handleFinish}
              >
                <Check className="size-4" />
                Завершить тренировку
              </Button>
            ) : (
              <Button className="flex-[2]" onClick={goNext}>
                Следующее упражнение
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (
                  confirm(
                    "Отменить тренировку? Все записанные подходы будут удалены.",
                  )
                ) {
                  handleCancel()
                }
              }}
              className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-destructive"
            >
              Отменить тренировку
            </button>
          )}
        </div>
      </div>

      {rest && (
        <RestTimer
          seconds={rest.seconds}
          label={rest.label}
          recommendation={rest.rec}
          onClose={() => setRest(null)}
        />
      )}
    </main>
  )
}

function CurrentExercise({
  exercise,
  position,
  total,
  doneSets,
  lastTimeSets,
  readOnly,
  onLogged,
  onReplaceId,
  onDeleted,
  onUpdated,
  sessionRef,
  offline,
  onRest,
  onAdvance,
}: {
  exercise: Exercise
  position: number
  total: number
  doneSets: SetRow[]
  lastTimeSets: LoggedSetLite[]
  readOnly: boolean
  onLogged: (row: SetRow) => void
  onReplaceId: (tempId: number, realId: number) => void
  onDeleted: (setId: number) => void
  onUpdated: (
    setId: number,
    weight: number | null,
    reps: number | null,
    rir: number | null,
  ) => void
  sessionRef: number | string
  offline: boolean
  onRest: (seconds: number, label: string, rec: Recommendation) => void
  onAdvance?: () => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const prescribed = parsePrescribedWeight(exercise.weightText)
  // вес задан процентом от ТМ -> нагрузка фиксирована программой, вверх не гоним
  const fixedLoad = isPercentPrescribed(exercise.weightText)

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
      { fixedLoad },
    )
  }, [doneSets, lastTimeSets, exercise.targetRirMin, exercise.targetRirMax, prescribed, fixedLoad])

  const hasTargets = Boolean(exercise.weightText || exercise.targetReps)
  const targetSetsNum = parseFirstInt(exercise.targetSets)
  const allSetsDone =
    targetSetsNum != null && doneSets.length >= targetSetsNum

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Упражнение {position} из {total}
          </p>
          <div className="mt-1 flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-balance text-2xl font-bold leading-tight">
              {exercise.name}
            </h2>
            <ExerciseGuideButton exerciseName={exercise.name} />
          </div>
          {(exercise.weightText ||
            exercise.targetReps ||
            exercise.targetSets ||
            exercise.tempo ||
            exercise.restSeconds ||
            exercise.targetRirMin != null) && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {exercise.weightText && (
                <Stat label="Вес" value={exercise.weightText} />
              )}
              {exercise.targetReps && (
                <Stat label="Повторения" value={exercise.targetReps} />
              )}
              {exercise.targetSets && (
                <Stat label="Подходы" value={exercise.targetSets} />
              )}
              {exercise.tempo && <Stat label="Темп" value={exercise.tempo} />}
              {exercise.restSeconds ? (
                <Stat label="Отдых" value={fmtRest(exercise.restSeconds)} />
              ) : null}
              {exercise.targetRirMin != null && (
                <Stat
                  label="RIR"
                  value={
                    exercise.targetRirMax != null &&
                    exercise.targetRirMax !== exercise.targetRirMin
                      ? `${exercise.targetRirMin}–${exercise.targetRirMax}`
                      : String(exercise.targetRirMin)
                  }
                />
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          {exercise.comment && (
            <p className="mb-3 rounded-md bg-secondary px-3 py-2 text-sm leading-relaxed text-secondary-foreground">
              {exercise.comment}
            </p>
          )}

          <div className="rounded-md border border-border px-3 py-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="size-3.5 shrink-0" />
              Прошлое выполнение
            </p>
            {lastTimeSets.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {lastTimeSets.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 text-sm"
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
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Первая тренировка с этим упражнением
              </p>
            )}
          </div>
        </div>
      </section>

      {rec && hasTargets && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs leading-relaxed ${
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
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Выполнено
            {targetSetsNum != null ? ` · ${doneSets.length} из ${targetSetsNum}` : ""}
          </p>
          <ul className="flex flex-col gap-1.5">
            {doneSets.map((s, i) =>
              editingId === s.id ? (
                <li
                  key={s.id}
                  className="rounded-md border border-primary/50 bg-secondary px-3 py-2"
                >
                  <EditSetForm
                    set={s}
                    onCancel={() => setEditingId(null)}
                    onSave={(weight, reps, rir) => {
                      setEditingId(null)
                      onUpdated(s.id, weight, reps, rir)
                      if (offline || s.id < 0) return
                      updateSet({
                        setId: s.id,
                        sessionId: typeof sessionRef === "number" ? sessionRef : 0,
                        weight,
                        reps,
                        rir,
                      }).catch(() => {})
                    }}
                  />
                </li>
              ) : (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-secondary px-3 py-2 text-sm"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                    <Check className="size-3.5" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span className="flex-1 text-center font-medium text-muted-foreground line-through decoration-2">
                    {s.weight != null ? `${s.weight} кг` : "—"} × {s.reps ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    RIR {s.rir ?? "—"}
                  </span>
                  {!readOnly && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        aria-label={`Редактировать подход ${i + 1}`}
                        onClick={() => setEditingId(s.id)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                        aria-label={`Удалить подход ${i + 1}`}
                        onClick={() => {
                          onDeleted(s.id)
                          if (offline || s.id < 0) return
                          deleteSet(
                            s.id,
                            typeof sessionRef === "number" ? sessionRef : 0,
                          ).catch((err) => {
                            if (isOffline(err)) {
                              pushOp({ kind: "deleteSet", setId: s.id })
                            }
                          })
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {hasTargets && !offline && <ExerciseHistory exerciseName={exercise.name} />}

      {!readOnly && doneSets.length === 0 && hasTargets && (
        <WarmupPlates workingWeight={rec?.weight ?? prescribed} />
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

            // запускаем таймер отдыха для этого упражнения
            if (exercise.restSeconds && exercise.restSeconds > 0) {
              const nextRec = recommendWeight(
                [
                  ...doneSets.map((s) => ({
                    weight: s.weight,
                    reps: s.reps,
                    rir: s.rir,
                  })),
                  { weight, reps, rir },
                ],
                exercise.targetRirMin,
                exercise.targetRirMax,
                prescribed,
                { fixedLoad },
              )
              onRest(exercise.restSeconds, `Отдых · ${exercise.name}`, nextRec)
            }

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

      {!readOnly && onAdvance && doneSets.length > 0 && (
        <Button
          variant={allSetsDone ? "default" : "outline"}
          className={allSetsDone ? "h-11 w-full" : "h-11 w-full bg-transparent"}
          onClick={onAdvance}
        >
          Закончить упражнение · следующее
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
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
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        unlockAudio()
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
        {saving ? "Сохраняю..." : "Закончить подход"}
      </Button>
    </form>
  )
}

/** Инлайн-редактирование записанного подхода */
function EditSetForm({
  set,
  onSave,
  onCancel,
}: {
  set: SetRow
  onSave: (weight: number | null, reps: number | null, rir: number | null) => void
  onCancel: () => void
}) {
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : "")
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : "")
  const [rir, setRir] = useState<number | null>(set.rir)

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const w = weight.trim() ? Number.parseFloat(weight.replace(",", ".")) : null
        const r = reps.trim() ? Number.parseInt(reps, 10) : null
        onSave(
          Number.isNaN(w as number) ? null : w,
          Number.isNaN(r as number) ? null : r,
          rir,
        )
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-w-${set.id}`} className="text-xs text-muted-foreground">
            Вес, кг
          </label>
          <input
            id={`edit-w-${set.id}`}
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-center text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-r-${set.id}`} className="text-xs text-muted-foreground">
            Повторения
          </label>
          <input
            id={`edit-r-${set.id}`}
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-center text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label="RIR">
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={rir === v}
            onClick={() => setRir(rir === v ? null : v)}
            className={`h-8 flex-1 rounded-md border text-xs font-semibold transition-colors ${
              rir === v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 bg-transparent" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" size="sm" className="flex-[2]">
          Сохранить
        </Button>
      </div>
    </form>
  )
}
