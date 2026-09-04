"use client"

import { useEffect, useRef, useState } from "react"
import { NotebookPen } from "lucide-react"
import { saveSessionNotes } from "@/app/actions/workout"

/**
 * Заметка к тренировке: самочувствие, технические нюансы
 * («плечо щёлкнуло», «штанга ушла вправо»). Сохраняется с дебаунсом.
 */
export function SessionNotes({
  sessionId,
  initialNotes,
  readOnly,
}: {
  sessionId: number
  initialNotes: string | null
  readOnly: boolean
}) {
  const [value, setValue] = useState(initialNotes ?? "")
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // последний введённый текст — на случай ухода со страницы до истечения дебаунса
  const latestRef = useRef(value)

  const onChange = (next: string) => {
    setValue(next)
    latestRef.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setStatus("saving")
      try {
        await saveSessionNotes(sessionId, next)
        setStatus("saved")
        setTimeout(() => setStatus("idle"), 2000)
      } catch {
        // офлайн — заметка останется в поле, сохранится при следующем изменении
        setStatus("idle")
      }
    }, 800)
  }

  // завершение тренировки или уход со страницы в окне дебаунса не должен терять заметку
  useEffect(() => {
    return () => {
      if (timer.current != null) {
        clearTimeout(timer.current)
        void saveSessionNotes(sessionId, latestRef.current).catch(() => {})
      }
    }
  }, [sessionId])

  if (readOnly && !value) return null

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`notes-${sessionId}`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <NotebookPen className="size-4 text-primary" aria-hidden="true" />
          Заметка к тренировке
        </label>
        {status !== "idle" && (
          <span className="text-xs text-muted-foreground">
            {status === "saving" ? "Сохраняю..." : "Сохранено"}
          </span>
        )}
      </div>
      <textarea
        id={`notes-${sessionId}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        rows={2}
        placeholder="Самочувствие, техника, боль/дискомфорт..."
        className="mt-2 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </section>
  )
}
