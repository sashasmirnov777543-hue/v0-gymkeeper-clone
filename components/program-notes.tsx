import { CircleAlert, Info, Target } from "lucide-react";

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
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  return (
    <section className={`overflow-hidden rounded-xl border border-border/80 bg-card/80 ${compact ? "mt-3" : ""}`}>
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
              key={`${index}-${line.slice(0, 16)}`}
              className={`flex items-start gap-3 px-4 ${compact ? "py-2.5" : "py-3"} ${tone === "warning" ? "bg-primary/[0.045]" : ""}`}
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "warning" ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{line}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
