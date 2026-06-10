import type { Metadata } from "next"
import { BottomNav } from "@/components/bottom-nav"
import { TechniqueList } from "@/components/technique-list"

export const metadata: Metadata = {
  title: "Техника упражнений",
  description:
    "Справочник техники: исходное положение, выполнение, темп и типичные ошибки каждого упражнения программы",
}

export default function TechniquePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-5">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Справочник
          </p>
          <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight">
            Техника упражнений
          </h1>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
            Исходное положение, выполнение, скорость и типичные ошибки. Доступно
            офлайн.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        <TechniqueList />
      </main>

      <BottomNav />
    </div>
  )
}
