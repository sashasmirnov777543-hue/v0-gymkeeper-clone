import { Dumbbell } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Dumbbell className="size-8 animate-pulse text-primary" aria-hidden="true" />
      <p className="text-sm">Загрузка программы…</p>
    </div>
  )
}
