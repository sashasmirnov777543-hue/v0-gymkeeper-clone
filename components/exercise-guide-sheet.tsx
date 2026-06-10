"use client"

import { useEffect, useState } from "react"
import { Info, X, Gauge, Target, ListChecks, AlertTriangle, Dumbbell } from "lucide-react"
import { findGuide, type ExerciseGuide } from "@/lib/exercise-guides"

/**
 * Кнопка-иконка рядом с упражнением: открывает нижнюю шторку
 * с техникой выполнения. Работает офлайн (данные в коде).
 */
export function ExerciseGuideButton({ exerciseName }: { exerciseName: string }) {
  const [open, setOpen] = useState(false)
  const guide = findGuide(exerciseName)

  if (!guide) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
        aria-label={`Техника: ${guide.title}`}
      >
        <Info className="size-4" />
      </button>
      {open && <GuideSheet guide={guide} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Нижняя шторка с полным описанием техники */
export function GuideSheet({
  guide,
  onClose,
}: {
  guide: ExerciseGuide
  onClose: () => void
}) {
  // блокируем скролл фона
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // закрытие по Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Техника выполнения: ${guide.title}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              Техника выполнения
            </p>
            <h2 className="mt-0.5 text-balance text-lg font-bold leading-snug">
              {guide.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4 pb-8">
          <GuideSection icon={Target} title="Зачем это упражнение">
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {guide.purpose}
            </p>
          </GuideSection>

          <GuideSection icon={Dumbbell} title="Исходное положение">
            <GuideList items={guide.setup} />
          </GuideSection>

          <GuideSection icon={ListChecks} title="Выполнение">
            <GuideList items={guide.execution} ordered />
          </GuideSection>

          <GuideSection icon={Gauge} title="Скорость и темп" highlight>
            <p className="text-pretty text-sm leading-relaxed">{guide.tempo}</p>
          </GuideSection>

          <GuideSection icon={AlertTriangle} title="Типичные ошибки">
            <GuideList items={guide.mistakes} warning />
          </GuideSection>
        </div>
      </div>
    </div>
  )
}

function GuideSection({
  icon: Icon,
  title,
  children,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <section
      className={
        highlight
          ? "rounded-lg border border-primary/30 bg-primary/10 px-4 py-3"
          : undefined
      }
    >
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className={`size-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
        {title}
      </h3>
      {children}
    </section>
  )
}

function GuideList({
  items,
  ordered,
  warning,
}: {
  items: string[]
  ordered?: boolean
  warning?: boolean
}) {
  const Tag = ordered ? "ol" : "ul"
  return (
    <Tag className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-pretty text-sm leading-relaxed">
          <span
            className={`mt-0.5 shrink-0 font-mono text-xs ${
              warning ? "text-warning" : "text-primary"
            }`}
          >
            {ordered ? `${i + 1}.` : "•"}
          </span>
          <span className="text-muted-foreground">{item}</span>
        </li>
      ))}
    </Tag>
  )
}
