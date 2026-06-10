"use client"

import { useState } from "react"
import { ChevronDown, LineChart } from "lucide-react"
import { getExerciseHistory } from "@/app/actions/workout"

type Point = { date: string; weight: number; reps: number }

/** Мини-график прогресса упражнения за последние тренировки (грузится по клику). */
export function ExerciseHistory({ exerciseName }: { exerciseName: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Point[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && data == null && !loading) {
      setLoading(true)
      try {
        const rows = await getExerciseHistory(exerciseName)
        setData(rows)
      } catch {
        setData([])
      } finally {
        setLoading(false)
      }
    }
  }

  const maxW = data && data.length ? Math.max(...data.map((d) => d.weight)) : 0
  const minW = data && data.length ? Math.min(...data.map((d) => d.weight)) : 0
  const range = maxW - minW || 1

  return (
    <div className="mb-3 overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 bg-secondary/50 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-medium text-secondary-foreground">
          <LineChart className="size-3.5" aria-hidden="true" />
          Динамика упражнения
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 py-3">
          {loading && <p className="text-xs text-muted-foreground">Загрузка...</p>}
          {!loading && data && data.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Пока нет завершённых тренировок с этим упражнением.
            </p>
          )}
          {!loading && data && data.length > 0 && (
            <>
              <div className="flex h-20 items-end gap-1.5">
                {data.map((d, i) => {
                  const h = 20 + ((d.weight - minW) / range) * 60
                  const isLast = i === data.length - 1
                  return (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {d.weight}
                      </span>
                      <div
                        className={`w-full rounded-t ${isLast ? "bg-primary" : "bg-primary/40"}`}
                        style={{ height: `${h}%` }}
                        title={`${d.weight} кг × ${d.reps}`}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>
                  {new Date(data[0].date).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span>
                  {new Date(data[data.length - 1].date).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
