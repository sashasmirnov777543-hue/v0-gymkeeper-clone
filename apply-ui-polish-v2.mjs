import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const full = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(full(p), "utf8");
const write = (p, content) => {
  fs.mkdirSync(path.dirname(full(p)), { recursive: true });
  fs.writeFileSync(full(p), content, "utf8");
  console.log(`✓ ${p}`);
};
const replaceOrFail = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`Не найден фрагмент: ${label}`);
  return source.replace(pattern, replacement);
};

write("components/program-notes.tsx", `import { CircleAlert, Info, Target } from "lucide-react";

type Props = { text: string; label?: string; compact?: boolean };

function lineTone(line: string) {
  const value = line.toLocaleLowerCase("ru-RU");
  if (value.startsWith("цель:")) return "target";
  if (
    value.startsWith("стоп") ||
    value.includes("запрещ") ||
    value.includes("красн") ||
    value.includes("при боли")
  ) return "warning";
  return "info";
}

export function ProgramNotes({ text, label = "План тренировки", compact = false }: Props) {
  const lines = text.split(/\\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  return (
    <section className={\`overflow-hidden rounded-xl border border-border/80 bg-card/80 \${compact ? "mt-3" : ""}\`}>
      <div className="flex items-center gap-2 border-b border-border/70 bg-secondary/35 px-4 py-2.5">
        <Info className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
      </div>
      <div className="divide-y divide-border/60">
        {lines.map((line, index) => {
          const tone = lineTone(line);
          const Icon = tone === "target" ? Target : tone === "warning" ? CircleAlert : Info;
          return (
            <div
              key={\`\${index}-\${line.slice(0, 16)}\`}
              className={\`flex items-start gap-3 px-4 \${compact ? "py-2.5" : "py-3"} \${tone === "warning" ? "bg-primary/[0.045]" : ""}\`}
            >
              <Icon className={\`mt-0.5 size-4 shrink-0 \${tone === "warning" ? "text-primary" : "text-muted-foreground"}\`} aria-hidden="true" />
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{line}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
`);

{
  const file = "app/page.tsx";
  let source = read(file);
  const constantsStart = source.indexOf("const MACRO_TITLES");
  const pageStart = source.indexOf("export default async function HomePage");
  if (constantsStart < 0 || pageStart < 0) throw new Error(`Не найдены заголовки в ${file}`);
  const constants = `const MACRO_TITLES: Record<string, Record<number, string>> = {
  v9: {
    1: "Этап 1 — техника и вход (циклы 1–4)",
    2: "Этап 2 — силовое накопление (циклы 5–8)",
    3: "Этап 3 — реализация и тест (циклы 9–13)",
  },
  h2: {
    1: "Этап 1 — накопление (циклы 1–5)",
    2: "Этап 2 — интенсификация (циклы 6–8)",
    3: "Этап 3 — переход к V9 (цикл 9)",
  },
};

const BLOCK_HEADER = {
  v9: {
    kicker: "Силовой блок · V9",
    title: "13 циклов · цель 122,5–125 кг",
    subtitle: "104 дня · 2 силовые и 2 кардио-сессии в каждом 8-дневном цикле",
  },
  h2: {
    kicker: "Гипертрофия и ОФП · H2",
    title: "9 циклов · фундамент перед V9",
    subtitle: "72 дня · контролируемый объём, техника жима и спокойное кардио",
  },
} as const;

`;
  source = source.slice(0, constantsStart) + constants + source.slice(pageStart);

  let labelsStart = source.indexOf("  // Сквозная нумерация");
  if (labelsStart < 0) labelsStart = source.indexOf("  // Компактная маркировка");
  const nextStart = source.indexOf("  let nextWorkout", labelsStart);
  if (labelsStart < 0 || nextStart < 0) throw new Error(`Не найдена маркировка дней в ${file}`);
  const labels = `  // Компактная маркировка: номер цикла + день B1–B4.
  const labelByWorkoutId = new Map<number, { label: string; isCardio: boolean }>();
  for (const c of orderedCycles) {
    const cycleWorkouts = blockWorkouts
      .filter((w) => w.cycleId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const w of cycleWorkouts) {
      labelByWorkoutId.set(w.id, {
        label: \`\${c.number}·\${w.label}\`,
        isCardio: w.kind === "cardio",
      });
    }
  }

`;
  source = source.slice(0, labelsStart) + labels + source.slice(nextStart);
  source = source.replace("ТМ {tmByMacro[macro]} кг", "RMref {tmByMacro[macro]} кг");
  source = source.replace("grid grid-cols-5 gap-2 sm:grid-cols-6", "grid grid-cols-4 gap-2 sm:grid-cols-5");
  write(file, source);
}

{
  const file = "app/workout/[id]/page.tsx";
  let source = read(file);

  if (!source.includes('from "@/components/program-notes"')) {
    source = replaceOrFail(
      source,
      /import\s*\{\s*ExerciseGuideButton\s*\}\s*from\s*["']@\/components\/exercise-guide-sheet["'];?\s*\r?\n/,
      (match) => `${match}import { ProgramNotes } from "@/components/program-notes";\n`,
      `${file}: импорт ExerciseGuideButton`,
    );
  }

  if (!source.includes("<ProgramNotes text={workout.notes}")) {
    source = replaceOrFail(
      source,
      /\{workout\.notes\s*&&\s*\(\s*<p\s+className=["']mt-1 text-sm text-muted-foreground["']>\s*\{workout\.notes\}\s*<\/p>\s*\)\}/m,
      `{workout.notes && (\n            <ProgramNotes text={workout.notes} compact />\n          )}`,
      `${file}: заметки тренировки`,
    );
  }

  source = source.replace(
    /\{cycle\?\.notes\s*&&\s*\(\s*<p\s+className=["']rounded-lg border border-border bg-card px-4 py-3 text-pretty text-sm leading-relaxed text-muted-foreground["']>\s*\{cycle\.notes\}\s*<\/p>\s*\)\}/gm,
    `{cycle?.notes && (\n              <ProgramNotes text={cycle.notes} label="План цикла" />\n            )}`,
  );

  if (!source.includes('<ProgramNotes text={cycle.notes} label="План цикла" />')) {
    throw new Error(`Не удалось заменить заметки цикла в ${file}`);
  }
  write(file, source);
}

write("migrations/007_program_presentation_cleanup.sql", `-- 007: меняется только представление программы; история и тренировки не затрагиваются.
UPDATE cycles
SET macrocycle = CASE
  WHEN block = 'h2' AND number BETWEEN 1 AND 5 THEN 1
  WHEN block = 'h2' AND number BETWEEN 6 AND 8 THEN 2
  WHEN block = 'h2' AND number = 9 THEN 3
  WHEN block = 'v9' AND number BETWEEN 1 AND 4 THEN 1
  WHEN block = 'v9' AND number BETWEEN 5 AND 8 THEN 2
  WHEN block = 'v9' AND number BETWEEN 9 AND 13 THEN 3
  ELSE macrocycle
END
WHERE block IN ('h2', 'v9');

UPDATE cycles
SET name = regexp_replace(name, '^Цикл [0-9]+ — ', '')
WHERE block IN ('h2', 'v9') AND name ~ '^Цикл [0-9]+ — ';
`);

console.log("\nГотово. Запускаю проверку TypeScript из BAT-файла.");
