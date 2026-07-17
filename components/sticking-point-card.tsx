import { getStickingPointRecommendation } from "@/lib/sticking-point";

const ZONE_LABELS = {
  chest: "у груди",
  middle: "в середине амплитуды",
  lockout: "в локауте",
} as const;

export async function StickingPointCard() {
  const rec = await getStickingPointRecommendation();
  if (!rec) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Зона стопора · последние 3 недели
      </p>
      <p className="mt-1 text-sm text-foreground">
        В тяжёлых подходах (RIR ≤ 1) штанга чаще всего стопорится{" "}
        <span className="font-semibold">{ZONE_LABELS[rec.zone]}</span> (
        {rec.counts[rec.zone]} из {rec.totalHardSets}).
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{rec.variation}</p>
      <p className="mt-1 text-xs text-muted-foreground">{rec.cue}</p>
    </div>
  );
}
