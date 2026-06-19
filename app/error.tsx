"use client"

import { useEffect } from "react"
import { RefreshCw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // лог в консоль для диагностики
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-bold">Не удалось загрузить данные</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Похоже, приложение не смогло подключиться к базе данных. Проверьте
        соединение с интернетом и попробуйте ещё раз. Если ошибка повторяется,
        возможно, база данных недоступна или "уснула" — откройте её в консоли Neon,
        чтобы разбудить, и повторите.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Повторить
      </button>
    </div>
  )
}
