"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { EXERCISE_GUIDES, type ExerciseGuide } from "@/lib/exercise-guides";
import { GuideSheet } from "@/components/exercise-guide-sheet";

const GROUPS: Array<{ title: string; match: (guide: ExerciseGuide) => boolean }> = [
  { title: "Главный жим и подготовка", match: (guide) => /Разминка|Соревновательный|Spoto|Узкий/.test(guide.title) },
  { title: "Грудь и плечи", match: (guide) => /гантел|Сведение|Махи/.test(guide.title) },
  { title: "Спина и реаб", match: (guide) => /Тяга|Верхний блок|Face pull/.test(guide.title) },
  { title: "Руки", match: (guide) => /Трицепс|Сгибания/.test(guide.title) },
  { title: "Кардио", match: (guide) => /Кардио/.test(guide.title) },
];

export function TechniqueList() {
  const [query, setQuery] = useState("");
  const [openGuide, setOpenGuide] = useState<ExerciseGuide | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return EXERCISE_GUIDES;
    return EXERCISE_GUIDES.filter(
      (guide) =>
        guide.title.toLocaleLowerCase("ru-RU").includes(normalized) ||
        guide.purpose.toLocaleLowerCase("ru-RU").includes(normalized) ||
        guide.keywords.some((keyword) => keyword.includes(normalized)),
    );
  }, [query]);
  const grouped = useMemo(() => {
    const used = new Set<string>();
    const result = GROUPS.map((group) => {
      const items = filtered.filter((guide) => {
        if (used.has(guide.title) || !group.match(guide)) return false;
        used.add(guide.title);
        return true;
      });
      return { title: group.title, items };
    }).filter((group) => group.items.length > 0);
    const remaining = filtered.filter((guide) => !used.has(guide.title));
    if (remaining.length) result.push({ title: "Прочее", items: remaining });
    return result;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-muted-foreground">
        Справочник соответствует H2→V9 v1. AMRAP, board press, pin press, тяжёлый JM-press, обязательные кластеры и миорепсы намеренно исключены.
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти упражнение…" className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      {grouped.map((group) => (
        <section key={group.title}>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{group.title}</h2>
          <ul className="space-y-2">
            {group.items.map((guide) => (
              <li key={guide.title}>
                <button type="button" onClick={() => setOpenGuide(guide)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary/40">
                  <div className="min-w-0"><p className="text-sm font-semibold">{guide.title}</p><p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{guide.purpose}</p></div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {grouped.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</p>}
      {openGuide && <GuideSheet guide={openGuide} onClose={() => setOpenGuide(null)} />}
    </div>
  );
}
