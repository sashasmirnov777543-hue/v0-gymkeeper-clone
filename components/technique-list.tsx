"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Search } from "lucide-react"
import { EXERCISE_GUIDES, type ExerciseGuide } from "@/lib/exercise-guides"
import { GuideSheet } from "@/components/exercise-guide-sheet"

/** Группы для навигации по справочнику */
const GROUPS: { title: string; match: (g: ExerciseGuide) => boolean }[] = [
  {
    title: "Жим и его вариации",
    match: (g) =>
      [
        "Жим лёжа (соревновательный)",
        "Паузный жим (2–3 сек)",
        "Spoto-жим",
        "Pin-press (жим со штифтов)",
        "Board press (жим с бруска)",
        "Изометрия в pin-press",
        "AMRAP-жим",
        "Техника середины (скоростной жим)",
      ].includes(g.title),
  },
  {
    title: "Трицепс и локаут",
    match: (g) =>
      [
        "Узкий жим / JM (тяжёлый)",
        "JM-press",
        "Разгибания из-за головы с нижнего блока",
      ].includes(g.title),
  },
  {
    title: "Грудь (гипертрофия)",
    match: (g) =>
      ["Жим гантелей на наклонной 30°", "Жим штанги на наклонной 30°", "Кроссовер"].includes(
        g.title,
      ),
  },
  {
    title: "Спина и здоровье плеч",
    match: (g) =>
      [
        "Тяга Т-штанги с упором",
        "Вертикальная тяга блока",
        "Горизонтальная тяга (блок)",
        "Face pull + ротация",
      ].includes(g.title),
  },
  {
    title: "Руки и предплечья",
    match: (g) =>
      ["Подъём EZ-штанги (бицепс, разные хваты)", "Молотковые + обратные сгибания / запястья"].includes(
        g.title,
      ),
  },
  {
    title: "Подготовка и настрой",
    match: (g) => ["Разминка", "Визуализация 1ПМ"].includes(g.title),
  },
]

export function TechniqueList() {
  const [query, setQuery] = useState("")
  const [openGuide, setOpenGuide] = useState<ExerciseGuide | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return EXERCISE_GUIDES
    return EXERCISE_GUIDES.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.purpose.toLowerCase().includes(q) ||
        g.keywords.some((k) => k.includes(q)),
    )
  }, [query])

  const grouped = useMemo(() => {
    const used = new Set<string>()
    const groups = GROUPS.map((grp) => {
      const items = filtered.filter((g) => {
        if (used.has(g.title)) return false
        if (grp.match(g)) {
          used.add(g.title)
          return true
        }
        return false
      })
      return { title: grp.title, items }
    }).filter((grp) => grp.items.length > 0)
    const rest = filtered.filter((g) => !used.has(g.title))
    if (rest.length > 0) groups.push({ title: "Прочее", items: rest })
    return groups
  }, [filtered])

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти упражнение..."
          className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Поиск по справочнику техники"
        />
      </div>

      {grouped.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ничего не найдено
        </p>
      )}

      {grouped.map((grp) => (
        <section key={grp.title}>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {grp.title}
          </h2>
          <ul className="flex flex-col gap-2">
            {grp.items.map((g) => (
              <li key={g.title}>
                <button
                  type="button"
                  onClick={() => setOpenGuide(g)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{g.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">
                      {g.purpose}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {openGuide && (
        <GuideSheet guide={openGuide} onClose={() => setOpenGuide(null)} />
      )}
    </div>
  )
}
