"use client"

import { useState } from "react"
import { ChevronDown, Layers } from "lucide-react"
import { platesFor, platesText, warmupSets } from "@/lib/plates"

/**
 * Разминочные подходы и раскладка блинов для рабочего веса.
 * Сворачивается, чтобы не мешать; вес берётся из рекомендации.
 */
export function WarmupPlates({ workingWeight }: { workingWeight: number | null }) {
  const [open, setOpen] = useState(false)

  if (!workingWeight || workingWeight <= 0) return null

  const warmups = warmupSets(workingWeight)
  const work = platesFor(workingWeight)

  return (
    <div className="mb-3 overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 bg-secondary/50 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-medium text-secondary-foreground">
          <Layers className="size-3.5" aria-hidden="true" />
          Разминка и блины к {workingWeight} кг
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-3 py-2.5">
          {warmups.length > 0 && (
            <ul className="flex flex-col gap-1">
              {warmups.map((w) => {
                const p = platesFor(w.weight)
                return (
                  <li
                    key={w.pct}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-muted-foreground">{w.pct}%</span>
                    <span className="font-mono font-semibold">
                      {w.weight} кг × {w.reps}
                    </span>
                    <span className="flex-1 text-right font-mono text-muted-foreground">
                      {platesText(p.perSide)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
            <span className="font-semibold text-primary">Рабочий</span>
            <span className="font-mono font-semibold">{work.achievable} кг</span>
            <span className="flex-1 text-right font-mono text-muted-foreground">
              на сторону: {platesText(work.perSide)}
            </span>
          </div>
          {work.leftover > 0 && (
            <p className="text-xs text-warning">
              {`Точно ${workingWeight} кг не набрать вашими блинами — ближайший ${work.achievable} кг`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
