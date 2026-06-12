"use client"

import { useTransition } from "react"
import { setActiveBlock } from "@/app/actions/workout"

const BLOCKS: { id: "h2" | "v9"; label: string }[] = [
  { id: "h2", label: "Гипертрофия H2" },
  { id: "v9", label: "Силовой V9" },
]

/** Переключатель программного блока (H2 — база перед V9, V9 — жимовой блок) */
export function BlockSwitcher({ active }: { active: "v9" | "h2" }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1"
      role="tablist"
      aria-label="Программный блок"
    >
      {BLOCKS.map((b) => {
        const isActive = b.id === active
        return (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isPending}
            onClick={() => {
              if (!isActive) startTransition(() => setActiveBlock(b.id))
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
