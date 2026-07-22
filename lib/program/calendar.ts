export const PROGRAM_DURATION_DAYS = 176;
export const CYCLE_LENGTH_DAYS = 8;
export const H2_CYCLE_COUNT = 9;
export const V9_CYCLE_COUNT = 13;
export const PROGRAM_CYCLE_COUNT = H2_CYCLE_COUNT + V9_CYCLE_COUNT;
export const V9_START_PROGRAM_DAY = H2_CYCLE_COUNT * CYCLE_LENGTH_DAYS + 1;
export const V9_FIRST_B2_PROGRAM_DAY = V9_START_PROGRAM_DAY + 3;
export const V9_TRANSITION_RECOVERY_ANCHOR = V9_FIRST_B2_PROGRAM_DAY - 1;

export const CYCLE_SLOTS = [
  "P1",
  "P2",
  "B1",
  "B2",
  "P3",
  "P4",
  "B3",
  "B4",
] as const;

export type DateOnly = string;
export type DateOnlyInput = DateOnly | Date;
export type ProgramBlock = "h2" | "v9";
export type ProgramSlot = (typeof CYCLE_SLOTS)[number];
export type ProgramDayId = `${ProgramBlock}-${number}-${Lowercase<ProgramSlot>}`;
export type RecoveryDayCount = 1 | 2 | 3 | 4;

export type RecoveryInsertion = Readonly<{
  /** Insert recovery dates immediately after this one-based program day. */
  afterProgramDay: number;
  count: RecoveryDayCount;
  label?: string;
}>;

export type PeakOffsetDays = -16 | -12 | -8 | -4 | -1 | 0 | 3;

type PeakScheduleDefinition = Readonly<{
  id: ProgramDayId;
  block: "v9";
  cycle: 11 | 12 | 13;
  slot: "B1" | "B2" | "B3" | "B4";
  offsetDays: PeakOffsetDays;
}>;

export const PEAK_SCHEDULE = [
  { id: "v9-11-b2", block: "v9", cycle: 11, slot: "B2", offsetDays: -16 },
  { id: "v9-11-b4", block: "v9", cycle: 11, slot: "B4", offsetDays: -12 },
  { id: "v9-12-b2", block: "v9", cycle: 12, slot: "B2", offsetDays: -8 },
  { id: "v9-12-b4", block: "v9", cycle: 12, slot: "B4", offsetDays: -4 },
  { id: "v9-13-b1", block: "v9", cycle: 13, slot: "B1", offsetDays: -1 },
  { id: "v9-13-b2", block: "v9", cycle: 13, slot: "B2", offsetDays: 0 },
  { id: "v9-13-b3", block: "v9", cycle: 13, slot: "B3", offsetDays: 3 },
] as const satisfies readonly PeakScheduleDefinition[];

export type PeakDayId = (typeof PEAK_SCHEDULE)[number]["id"];

export const PEAK_OFFSETS: Readonly<Record<PeakDayId, PeakOffsetDays>> = {
  "v9-11-b2": -16,
  "v9-11-b4": -12,
  "v9-12-b2": -8,
  "v9-12-b4": -4,
  "v9-13-b1": -1,
  "v9-13-b2": 0,
  "v9-13-b3": 3,
};

export type ProgramDay = Readonly<{
  kind: "program";
  id: ProgramDayId;
  date: DateOnly;
  /** One-based day in the full 176-day program. */
  programDay: number;
  /** One-based cycle in the full 22-cycle program. */
  cycleIndex: number;
  block: ProgramBlock;
  /** One-based cycle inside H2 or V9. */
  cycle: number;
  /** One-based day inside the eight-day cycle. */
  cycleDay: number;
  slot: ProgramSlot;
  peakOffsetDays: PeakOffsetDays | null;
  /** Date required by the selected T0, when this is a peak item. */
  peakTargetDate: DateOnly | null;
  /** Null outside the peak schedule. */
  isOnPeakTarget: boolean | null;
}>;

export type RecoveryDay = Readonly<{
  kind: "recovery";
  id: `recovery-after-${number}-${number}`;
  date: DateOnly;
  afterProgramDay: number;
  recoveryDay: number;
  recoveryCount: RecoveryDayCount;
  label: string | null;
}>;

export type CalendarItem = ProgramDay | RecoveryDay;

export type PeakCalendarDay = Readonly<{
  id: PeakDayId;
  offsetDays: PeakOffsetDays;
  date: DateOnly;
  targetDate: DateOnly;
  isOnTarget: boolean;
}>;

export type ProgramCalendarOptions = Readonly<{
  /** A local date (prefer YYYY-MM-DD) for H2-1 P1. */
  startDate: DateOnlyInput;
  /**
   * Convenience for the prescribed 1–4 extra recovery days immediately before
   * the first V9 B2 (after V9-1 B1). Use recoveryInsertions for other pauses.
   */
  transitionRecoveryDays?: 0 | RecoveryDayCount;
  recoveryInsertions?: readonly RecoveryInsertion[];
  /** Optional explicit test date. Without it, V9-13 B2 is T0. */
  t0Date?: DateOnlyInput;
}>;

export type ProgramCalendar = Readonly<{
  startDate: DateOnly;
  endDate: DateOnly;
  programEndDate: DateOnly;
  durationDays: number;
  totalRecoveryDays: number;
  scheduledT0Date: DateOnly;
  t0Date: DateOnly;
  hasExplicitT0Date: boolean;
  isT0Aligned: boolean;
  isPeakScheduleAligned: boolean;
  items: readonly CalendarItem[];
  programDays: readonly ProgramDay[];
  recoveryDays: readonly RecoveryDay[];
  peakDays: readonly PeakCalendarDay[];
}>;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const peakOffsetById = new Map<ProgramDayId, PeakOffsetDays>(
  PEAK_SCHEDULE.map(
    ({ id, offsetDays }): readonly [ProgramDayId, PeakOffsetDays] => [
      id,
      offsetDays,
    ],
  ),
);

function utcMilliseconds(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function parseDateOnly(value: DateOnly, fieldName: string): number {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(`${fieldName} must use YYYY-MM-DD`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const milliseconds = utcMilliseconds(year, month, day);
  const parsed = new Date(milliseconds);

  if (
    year < 1 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`${fieldName} is not a valid calendar date`);
  }

  return milliseconds / MILLISECONDS_PER_DAY;
}

function formatUtcDate(date: Date): DateOnly {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Convert a Date using its local calendar fields, without carrying a time zone forward. */
export function localDateOnly(date: Date): DateOnly {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("date must be valid");
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateOnly(
  value: DateOnlyInput,
  fieldName = "date",
): DateOnly {
  const normalized = value instanceof Date ? localDateOnly(value) : value;
  parseDateOnly(normalized, fieldName);
  return normalized;
}

export function addDateOnlyDays(
  value: DateOnlyInput,
  amount: number,
): DateOnly {
  if (!Number.isInteger(amount)) {
    throw new TypeError("amount must be an integer number of days");
  }
  const date = normalizeDateOnly(value);
  const epochDay = parseDateOnly(date, "date") + amount;
  return formatUtcDate(new Date(epochDay * MILLISECONDS_PER_DAY));
}

/** Returns `to - from` in whole calendar days. */
export function differenceInDateOnlyDays(
  from: DateOnlyInput,
  to: DateOnlyInput,
): number {
  const start = normalizeDateOnly(from, "from");
  const end = normalizeDateOnly(to, "to");
  return parseDateOnly(end, "to") - parseDateOnly(start, "from");
}

export function compareDateOnly(
  left: DateOnlyInput,
  right: DateOnlyInput,
): -1 | 0 | 1 {
  const difference = differenceInDateOnlyDays(left, right);
  return difference === 0 ? 0 : difference > 0 ? -1 : 1;
}

function assertProgramDay(programDay: number): void {
  if (
    !Number.isInteger(programDay) ||
    programDay < 1 ||
    programDay > PROGRAM_DURATION_DAYS
  ) {
    throw new RangeError(
      `programDay must be an integer from 1 to ${PROGRAM_DURATION_DAYS}`,
    );
  }
}

function assertCycle(block: ProgramBlock, cycle: number): void {
  const maximum = block === "h2" ? H2_CYCLE_COUNT : V9_CYCLE_COUNT;
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > maximum) {
    throw new RangeError(`${block} cycle must be an integer from 1 to ${maximum}`);
  }
}

export function getProgramDayNumber(
  block: ProgramBlock,
  cycle: number,
  slot: ProgramSlot,
): number {
  assertCycle(block, cycle);
  const slotIndex = CYCLE_SLOTS.indexOf(slot);
  if (slotIndex === -1) {
    throw new RangeError(`Unknown program slot: ${String(slot)}`);
  }
  const cycleIndex = block === "h2" ? cycle : H2_CYCLE_COUNT + cycle;
  return (cycleIndex - 1) * CYCLE_LENGTH_DAYS + slotIndex + 1;
}

export function getProgramDayDescriptor(
  programDay: number,
): Omit<
  ProgramDay,
  "kind" | "date" | "peakTargetDate" | "isOnPeakTarget"
> {
  assertProgramDay(programDay);
  const cycleIndex = Math.floor((programDay - 1) / CYCLE_LENGTH_DAYS) + 1;
  const cycleDay = ((programDay - 1) % CYCLE_LENGTH_DAYS) + 1;
  const block: ProgramBlock = cycleIndex <= H2_CYCLE_COUNT ? "h2" : "v9";
  const cycle = block === "h2" ? cycleIndex : cycleIndex - H2_CYCLE_COUNT;
  const slot = CYCLE_SLOTS[cycleDay - 1];
  const id = `${block}-${cycle}-${slot.toLowerCase()}` as ProgramDayId;

  return {
    id,
    programDay,
    cycleIndex,
    block,
    cycle,
    cycleDay,
    slot,
    peakOffsetDays: peakOffsetById.get(id) ?? null,
  };
}

export function getPeakDate(
  t0Date: DateOnlyInput,
  peakDayId: PeakDayId,
): DateOnly {
  const offset = PEAK_OFFSETS[peakDayId];
  if (offset === undefined) {
    throw new RangeError(`Unknown peak day: ${String(peakDayId)}`);
  }
  return addDateOnlyDays(normalizeDateOnly(t0Date, "t0Date"), offset);
}

function normalizeRecoveryInsertions(
  insertions: readonly RecoveryInsertion[],
): readonly RecoveryInsertion[] {
  const anchors = new Set<number>();
  return [...insertions]
    .map((insertion) => {
      assertProgramDay(insertion.afterProgramDay);
      if (
        !Number.isInteger(insertion.count) ||
        insertion.count < 1 ||
        insertion.count > 4
      ) {
        throw new RangeError("Recovery insertion count must be from 1 to 4");
      }
      if (anchors.has(insertion.afterProgramDay)) {
        throw new RangeError(
          `Only one recovery insertion is allowed after program day ${insertion.afterProgramDay}`,
        );
      }
      anchors.add(insertion.afterProgramDay);
      return { ...insertion };
    })
    .sort((left, right) => left.afterProgramDay - right.afterProgramDay);
}

export function buildProgramCalendar(
  options: ProgramCalendarOptions,
): ProgramCalendar {
  const startDate = normalizeDateOnly(options.startDate, "startDate");
  const transitionRecoveryDays = options.transitionRecoveryDays ?? 0;
  if (
    !Number.isInteger(transitionRecoveryDays) ||
    transitionRecoveryDays < 0 ||
    transitionRecoveryDays > 4
  ) {
    throw new RangeError("Transition recovery days must be from 0 to 4");
  }
  const requestedInsertions: RecoveryInsertion[] = [
    ...(options.recoveryInsertions ?? []),
  ];
  if (transitionRecoveryDays > 0) {
    requestedInsertions.push({
      afterProgramDay: V9_TRANSITION_RECOVERY_ANCHOR,
      count: transitionRecoveryDays as RecoveryDayCount,
      label: "V9 transition recovery",
    });
  }
  const recoveryInsertions = normalizeRecoveryInsertions(requestedInsertions);
  const recoveryByProgramDay = new Map<number, RecoveryInsertion>(
    recoveryInsertions.map(
      (insertion): readonly [number, RecoveryInsertion] => [
        insertion.afterProgramDay,
        insertion,
      ],
    ),
  );
  const unannotatedItems: Array<
    | Omit<ProgramDay, "peakTargetDate" | "isOnPeakTarget">
    | RecoveryDay
  > = [];
  let cursor = startDate;

  for (let programDay = 1; programDay <= PROGRAM_DURATION_DAYS; programDay += 1) {
    const descriptor = getProgramDayDescriptor(programDay);
    unannotatedItems.push({ kind: "program", date: cursor, ...descriptor });
    cursor = addDateOnlyDays(cursor, 1);

    const insertion = recoveryByProgramDay.get(programDay);
    if (!insertion) continue;

    for (let recoveryDay = 1; recoveryDay <= insertion.count; recoveryDay += 1) {
      unannotatedItems.push({
        kind: "recovery",
        id: `recovery-after-${programDay}-${recoveryDay}` as RecoveryDay["id"],
        date: cursor,
        afterProgramDay: programDay,
        recoveryDay,
        recoveryCount: insertion.count,
        label: insertion.label ?? null,
      });
      cursor = addDateOnlyDays(cursor, 1);
    }
  }

  const scheduledT0Item = unannotatedItems.find(
    (item) => item.kind === "program" && item.id === "v9-13-b2",
  );
  if (!scheduledT0Item) {
    throw new Error("The generated calendar is missing V9-13 B2");
  }

  const hasExplicitT0Date = options.t0Date !== undefined;
  const t0Date = hasExplicitT0Date
    ? normalizeDateOnly(options.t0Date as DateOnlyInput, "t0Date")
    : scheduledT0Item.date;
  const items: CalendarItem[] = unannotatedItems.map((item) => {
    if (item.kind === "recovery") return item;
    const peakTargetDate =
      item.peakOffsetDays === null
        ? null
        : addDateOnlyDays(t0Date, item.peakOffsetDays);
    return {
      ...item,
      peakTargetDate,
      isOnPeakTarget: peakTargetDate === null ? null : peakTargetDate === item.date,
    };
  });
  const programDays = items.filter(
    (item): item is ProgramDay => item.kind === "program",
  );
  const recoveryDays = items.filter(
    (item): item is RecoveryDay => item.kind === "recovery",
  );
  const peakDays = PEAK_SCHEDULE.map(({ id, offsetDays }) => {
    const day = programDays.find((item) => item.id === id);
    if (!day) throw new Error(`The generated calendar is missing ${id}`);
    const targetDate = addDateOnlyDays(t0Date, offsetDays);
    return {
      id,
      offsetDays,
      date: day.date,
      targetDate,
      isOnTarget: day.date === targetDate,
    };
  });
  const programEndDate = programDays[programDays.length - 1].date;
  const endDate = items[items.length - 1].date;

  return {
    startDate,
    endDate,
    programEndDate,
    durationDays: differenceInDateOnlyDays(startDate, endDate) + 1,
    totalRecoveryDays: recoveryDays.length,
    scheduledT0Date: scheduledT0Item.date,
    t0Date,
    hasExplicitT0Date,
    isT0Aligned: scheduledT0Item.date === t0Date,
    isPeakScheduleAligned: peakDays.every((day) => day.isOnTarget),
    items,
    programDays,
    recoveryDays,
    peakDays,
  };
}

export const createProgramCalendar = buildProgramCalendar;

export function getTodayItem(
  calendar: ProgramCalendar,
  today: DateOnlyInput,
): CalendarItem | null {
  const date = normalizeDateOnly(today, "today");
  return calendar.items.find((item) => item.date === date) ?? null;
}

/** Returns the first calendar item strictly after the supplied local date. */
export function getNextItem(
  calendar: ProgramCalendar,
  afterDate: DateOnlyInput,
): CalendarItem | null {
  const date = normalizeDateOnly(afterDate, "afterDate");
  return (
    calendar.items.find((item) => differenceInDateOnlyDays(date, item.date) > 0) ??
    null
  );
}

/** Returns today's item when present, otherwise the first future item. */
export function getCurrentOrNextItem(
  calendar: ProgramCalendar,
  today: DateOnlyInput,
): CalendarItem | null {
  return getTodayItem(calendar, today) ?? getNextItem(calendar, today);
}

export function getTodayAndNextItems(
  calendar: ProgramCalendar,
  today: DateOnlyInput,
): Readonly<{ today: CalendarItem | null; next: CalendarItem | null }> {
  return {
    today: getTodayItem(calendar, today),
    next: getNextItem(calendar, today),
  };
}
