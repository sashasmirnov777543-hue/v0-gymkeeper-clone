export type RhrMeasurement = Readonly<{
  measuredOn: string;
  bpm: number;
  repeatedBpm?: number | null;
  comparable: boolean;
  poorWellbeing?: boolean;
}>;

export type RhrTrend = Readonly<{
  baseline: number | null;
  latest: number | null;
  delta: number | null;
  elevatedComparableMornings: number;
  yellowSignal: boolean;
}>;

export function median(values: readonly number[]): number | null {
  const finite = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 0
    ? (finite[middle - 1] + finite[middle]) / 2
    : finite[middle];
}

export function effectiveRhr(measurement: RhrMeasurement): number {
  return measurement.repeatedBpm != null
    ? measurement.repeatedBpm
    : measurement.bpm;
}

export function rhrBaseline(
  measurements: readonly RhrMeasurement[],
  beforeDate?: string,
): number | null {
  const comparable = measurements
    .filter(
      (item) =>
        item.comparable &&
        (!beforeDate || item.measuredOn < beforeDate) &&
        Number.isFinite(effectiveRhr(item)),
    )
    .sort((a, b) => b.measuredOn.localeCompare(a.measuredOn))
    .slice(0, 7)
    .map(effectiveRhr);
  return median(comparable);
}

export function assessRhrTrend(
  measurements: readonly RhrMeasurement[],
): RhrTrend {
  const ordered = measurements
    .filter((item) => item.comparable)
    .slice()
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const latestRow = ordered.at(-1);
  if (!latestRow) {
    return {
      baseline: null,
      latest: null,
      delta: null,
      elevatedComparableMornings: 0,
      yellowSignal: false,
    };
  }
  const baseline = rhrBaseline(ordered, latestRow.measuredOn);
  const latest = effectiveRhr(latestRow);
  const delta = baseline == null ? null : latest - baseline;
  if (baseline == null) {
    return {
      baseline,
      latest,
      delta,
      elevatedComparableMornings: 0,
      yellowSignal: false,
    };
  }
  const recent = ordered.slice(-2);
  const elevatedComparableMornings = recent.filter(
    (item) => effectiveRhr(item) - baseline >= 5,
  ).length;
  const poorWellbeing = recent.some((item) => item.poorWellbeing === true);
  return {
    baseline,
    latest,
    delta,
    elevatedComparableMornings,
    yellowSignal: elevatedComparableMornings >= 2 && poorWellbeing,
  };
}
