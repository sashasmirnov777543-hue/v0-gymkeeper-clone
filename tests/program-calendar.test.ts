import assert from "node:assert/strict";
import test from "node:test";
import {
  CYCLE_LENGTH_DAYS,
  CYCLE_SLOTS,
  H2_CYCLE_COUNT,
  PEAK_SCHEDULE,
  PROGRAM_CYCLE_COUNT,
  PROGRAM_DURATION_DAYS,
  V9_CYCLE_COUNT,
  V9_FIRST_B2_PROGRAM_DAY,
  V9_TRANSITION_RECOVERY_ANCHOR,
  addDateOnlyDays,
  buildProgramCalendar,
  compareDateOnly,
  differenceInDateOnlyDays,
  getCurrentOrNextItem,
  getNextItem,
  getPeakDate,
  getProgramDayDescriptor,
  getProgramDayNumber,
  getTodayAndNextItems,
  getTodayItem,
  localDateOnly,
  normalizeDateOnly,
  type ProgramCalendar,
  type ProgramDay,
} from "../lib/program/calendar.ts";

function programDay(calendar: ProgramCalendar, number: number): ProgramDay {
  const day = calendar.programDays[number - 1];
  assert.ok(day, `Missing program day ${number}`);
  return day;
}

test("builds all 22 eight-day H2 to V9 cycles without dropping V9-1 days 1-3", () => {
  const calendar = buildProgramCalendar({ startDate: "2024-01-01" });

  assert.equal(CYCLE_LENGTH_DAYS, 8);
  assert.equal(H2_CYCLE_COUNT, 9);
  assert.equal(V9_CYCLE_COUNT, 13);
  assert.equal(PROGRAM_CYCLE_COUNT, 22);
  assert.equal(PROGRAM_DURATION_DAYS, 176);
  assert.equal(V9_TRANSITION_RECOVERY_ANCHOR, 75);
  assert.equal(V9_FIRST_B2_PROGRAM_DAY, 76);
  assert.equal(calendar.programDays.length, 176);
  assert.equal(calendar.items.length, 176);
  assert.equal(calendar.recoveryDays.length, 0);
  assert.equal(calendar.durationDays, 176);
  assert.equal(calendar.programEndDate, "2024-06-24");
  assert.equal(calendar.endDate, "2024-06-24");

  for (let cycleIndex = 1; cycleIndex <= PROGRAM_CYCLE_COUNT; cycleIndex += 1) {
    const days = calendar.programDays.slice(
      (cycleIndex - 1) * CYCLE_LENGTH_DAYS,
      cycleIndex * CYCLE_LENGTH_DAYS,
    );
    assert.deepEqual(
      days.map((day) => day.slot),
      CYCLE_SLOTS,
      `cycle ${cycleIndex} slot order`,
    );
    assert.deepEqual(
      days.map((day) => day.cycleDay),
      [1, 2, 3, 4, 5, 6, 7, 8],
      `cycle ${cycleIndex} day numbering`,
    );
  }

  assert.deepEqual(
    [1, 8, 9, 72, 73, 74, 75, 76, 80, 81, 176].map((number) => {
      const day = programDay(calendar, number);
      return [day.id, day.date];
    }),
    [
      ["h2-1-p1", "2024-01-01"],
      ["h2-1-b4", "2024-01-08"],
      ["h2-2-p1", "2024-01-09"],
      ["h2-9-b4", "2024-03-12"],
      ["v9-1-p1", "2024-03-13"],
      ["v9-1-p2", "2024-03-14"],
      ["v9-1-b1", "2024-03-15"],
      ["v9-1-b2", "2024-03-16"],
      ["v9-1-b4", "2024-03-20"],
      ["v9-2-p1", "2024-03-21"],
      ["v9-13-b4", "2024-06-24"],
    ],
  );
  assert.equal(
    differenceInDateOnlyDays(programDay(calendar, 72).date, programDay(calendar, 76).date),
    4,
  );
});

test("maps every program-day and block boundary", () => {
  assert.equal(getProgramDayNumber("h2", 1, "P1"), 1);
  assert.equal(getProgramDayNumber("h2", 9, "B4"), 72);
  assert.equal(getProgramDayNumber("v9", 1, "P1"), 73);
  assert.equal(getProgramDayNumber("v9", 1, "B2"), 76);
  assert.equal(getProgramDayNumber("v9", 13, "B4"), 176);

  assert.deepEqual(getProgramDayDescriptor(72), {
    id: "h2-9-b4",
    programDay: 72,
    cycleIndex: 9,
    block: "h2",
    cycle: 9,
    cycleDay: 8,
    slot: "B4",
    peakOffsetDays: null,
  });
  assert.deepEqual(getProgramDayDescriptor(73), {
    id: "v9-1-p1",
    programDay: 73,
    cycleIndex: 10,
    block: "v9",
    cycle: 1,
    cycleDay: 1,
    slot: "P1",
    peakOffsetDays: null,
  });
  assert.equal(getProgramDayDescriptor(156).id, "v9-11-b2");
  assert.equal(getProgramDayDescriptor(156).peakOffsetDays, -16);
  assert.equal(getProgramDayDescriptor(172).id, "v9-13-b2");
  assert.equal(getProgramDayDescriptor(172).peakOffsetDays, 0);
});

test("date-only arithmetic crosses leap days, DST dates, months, and years in UTC-safe whole days", () => {
  assert.equal(addDateOnlyDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDateOnlyDays("2024-02-28", 2), "2024-03-01");
  assert.equal(addDateOnlyDays("2023-02-28", 1), "2023-03-01");
  assert.equal(addDateOnlyDays("2024-03-09", 1), "2024-03-10");
  assert.equal(addDateOnlyDays("2024-03-10", 1), "2024-03-11");
  assert.equal(addDateOnlyDays("2024-11-03", 1), "2024-11-04");
  assert.equal(addDateOnlyDays("2024-01-01", -1), "2023-12-31");
  assert.equal(differenceInDateOnlyDays("2023-12-31", "2024-01-02"), 2);
  assert.equal(compareDateOnly("2024-01-01", "2024-01-02"), -1);
  assert.equal(compareDateOnly("2024-01-02", "2024-01-02"), 0);
  assert.equal(compareDateOnly("2024-01-03", "2024-01-02"), 1);

  const localDate = new Date(2024, 4, 6, 23, 30);
  assert.equal(localDateOnly(localDate), "2024-05-06");
  assert.equal(normalizeDateOnly(localDate), "2024-05-06");
});

test("derives the seven peak dates from scheduled or explicit T0", () => {
  const calendar = buildProgramCalendar({ startDate: "2024-01-01" });

  assert.equal(calendar.scheduledT0Date, "2024-06-20");
  assert.equal(calendar.t0Date, "2024-06-20");
  assert.equal(calendar.hasExplicitT0Date, false);
  assert.equal(calendar.isT0Aligned, true);
  assert.equal(calendar.isPeakScheduleAligned, true);
  assert.deepEqual(
    calendar.peakDays.map(({ id, offsetDays, date, targetDate, isOnTarget }) => ({
      id,
      offsetDays,
      date,
      targetDate,
      isOnTarget,
    })),
    [
      { id: "v9-11-b2", offsetDays: -16, date: "2024-06-04", targetDate: "2024-06-04", isOnTarget: true },
      { id: "v9-11-b4", offsetDays: -12, date: "2024-06-08", targetDate: "2024-06-08", isOnTarget: true },
      { id: "v9-12-b2", offsetDays: -8, date: "2024-06-12", targetDate: "2024-06-12", isOnTarget: true },
      { id: "v9-12-b4", offsetDays: -4, date: "2024-06-16", targetDate: "2024-06-16", isOnTarget: true },
      { id: "v9-13-b1", offsetDays: -1, date: "2024-06-19", targetDate: "2024-06-19", isOnTarget: true },
      { id: "v9-13-b2", offsetDays: 0, date: "2024-06-20", targetDate: "2024-06-20", isOnTarget: true },
      { id: "v9-13-b3", offsetDays: 3, date: "2024-06-23", targetDate: "2024-06-23", isOnTarget: true },
    ],
  );

  const explicitDates = [
    "2025-07-04",
    "2025-07-08",
    "2025-07-12",
    "2025-07-16",
    "2025-07-19",
    "2025-07-20",
    "2025-07-23",
  ];
  assert.deepEqual(
    PEAK_SCHEDULE.map((peak) => getPeakDate("2025-07-20", peak.id)),
    explicitDates,
  );

  const explicit = buildProgramCalendar({
    startDate: "2024-01-01",
    t0Date: "2024-06-25",
  });
  assert.equal(explicit.t0Date, "2024-06-25");
  assert.equal(explicit.scheduledT0Date, "2024-06-20");
  assert.equal(explicit.hasExplicitT0Date, true);
  assert.equal(explicit.isT0Aligned, false);
  assert.equal(explicit.isPeakScheduleAligned, false);
  assert.deepEqual(
    explicit.peakDays.map((day) => day.targetDate),
    ["2024-06-09", "2024-06-13", "2024-06-17", "2024-06-21", "2024-06-24", "2024-06-25", "2024-06-28"],
  );
});

test("adds 1-4 transition recovery days only after V9-1 P1/P2/B1", () => {
  const calendar = buildProgramCalendar({
    startDate: "2024-01-01",
    transitionRecoveryDays: 4,
  });

  assert.deepEqual(
    [72, 73, 74, 75, 76].map((number) => {
      const day = programDay(calendar, number);
      return [day.id, day.date];
    }),
    [
      ["h2-9-b4", "2024-03-12"],
      ["v9-1-p1", "2024-03-13"],
      ["v9-1-p2", "2024-03-14"],
      ["v9-1-b1", "2024-03-15"],
      ["v9-1-b2", "2024-03-20"],
    ],
  );
  assert.deepEqual(
    calendar.recoveryDays.map((day) => [day.date, day.afterProgramDay]),
    [
      ["2024-03-16", 75],
      ["2024-03-17", 75],
      ["2024-03-18", 75],
      ["2024-03-19", 75],
    ],
  );
  assert.equal(calendar.programEndDate, "2024-06-28");
  assert.equal(calendar.scheduledT0Date, "2024-06-24");
});

test("inserts one and four recovery days, keeps every item, and cumulatively shifts only following sessions", () => {
  const calendar = buildProgramCalendar({
    startDate: "2024-01-01",
    t0Date: "2024-06-25",
    recoveryInsertions: [
      { afterProgramDay: 72, count: 4, label: "deload" },
      { afterProgramDay: 1, count: 1 },
    ],
  });

  assert.equal(calendar.programDays.length, 176);
  assert.equal(calendar.recoveryDays.length, 5);
  assert.equal(calendar.items.length, 181);
  assert.equal(calendar.totalRecoveryDays, 5);
  assert.equal(calendar.durationDays, 181);
  assert.equal(calendar.programEndDate, "2024-06-29");
  assert.equal(calendar.endDate, "2024-06-29");
  assert.equal(calendar.scheduledT0Date, "2024-06-25");
  assert.equal(calendar.t0Date, "2024-06-25");
  assert.equal(calendar.isT0Aligned, true);
  assert.equal(calendar.isPeakScheduleAligned, true);
  assert.ok(calendar.peakDays.every((day) => day.isOnTarget));

  assert.equal(programDay(calendar, 1).date, "2024-01-01");
  assert.equal(programDay(calendar, 2).date, "2024-01-03");
  assert.equal(programDay(calendar, 72).date, "2024-03-13");
  assert.equal(programDay(calendar, 73).date, "2024-03-18");
  assert.equal(programDay(calendar, 73).id, "v9-1-p1");
  assert.deepEqual(
    calendar.recoveryDays.map((day) => [day.date, day.afterProgramDay, day.label]),
    [
      ["2024-01-02", 1, null],
      ["2024-03-14", 72, "deload"],
      ["2024-03-15", 72, "deload"],
      ["2024-03-16", 72, "deload"],
      ["2024-03-17", 72, "deload"],
    ],
  );

  for (let index = 1; index < calendar.items.length; index += 1) {
    assert.equal(
      differenceInDateOnlyDays(
        calendar.items[index - 1].date,
        calendar.items[index].date,
      ),
      1,
      `items ${index} and ${index + 1} must stay on consecutive dates`,
    );
  }
});

test("supports recovery insertion at the final boundary and every allowed count", () => {
  for (const count of [1, 2, 3, 4] as const) {
    const calendar = buildProgramCalendar({
      startDate: "2024-01-01",
      recoveryInsertions: [{ afterProgramDay: 176, count }],
    });
    assert.equal(calendar.programEndDate, "2024-06-24");
    assert.equal(calendar.endDate, addDateOnlyDays("2024-06-24", count));
    assert.equal(calendar.durationDays, 176 + count);
    assert.equal(calendar.recoveryDays.length, count);
  }
});

test("today and next helpers cover before, on, recovery, final, and after-calendar dates", () => {
  const calendar = buildProgramCalendar({
    startDate: "2024-01-10",
    recoveryInsertions: [{ afterProgramDay: 1, count: 2 }],
  });

  assert.equal(getTodayItem(calendar, "2024-01-09"), null);
  assert.equal(getNextItem(calendar, "2024-01-09")?.id, "h2-1-p1");
  assert.equal(getCurrentOrNextItem(calendar, "2024-01-09")?.id, "h2-1-p1");

  assert.equal(getTodayItem(calendar, "2024-01-10")?.id, "h2-1-p1");
  assert.equal(getNextItem(calendar, "2024-01-10")?.id, "recovery-after-1-1");
  assert.equal(getCurrentOrNextItem(calendar, "2024-01-10")?.id, "h2-1-p1");

  assert.deepEqual(getTodayAndNextItems(calendar, "2024-01-11"), {
    today: calendar.recoveryDays[0],
    next: calendar.recoveryDays[1],
  });
  assert.equal(getTodayItem(calendar, "2024-01-13")?.id, "h2-1-p2");

  assert.equal(getTodayItem(calendar, calendar.endDate)?.id, "v9-13-b4");
  assert.equal(getNextItem(calendar, calendar.endDate), null);
  assert.equal(getCurrentOrNextItem(calendar, addDateOnlyDays(calendar.endDate, 1)), null);
});

test("rejects malformed dates, invalid boundaries, duplicate anchors, and recovery counts outside 1-4", () => {
  assert.throws(() => normalizeDateOnly("2024/01/01"), /YYYY-MM-DD/);
  assert.throws(() => normalizeDateOnly("2023-02-29"), /valid calendar date/);
  assert.throws(() => addDateOnlyDays("2024-01-01", 1.5), /integer/);
  assert.throws(() => getProgramDayDescriptor(0), /1 to 176/);
  assert.throws(() => getProgramDayDescriptor(177), /1 to 176/);
  assert.throws(() => getProgramDayNumber("h2", 10, "P1"), /1 to 9/);
  assert.throws(() => getProgramDayNumber("v9", 14, "P1"), /1 to 13/);
  assert.throws(
    () =>
      buildProgramCalendar({
        startDate: "2024-01-01",
        recoveryInsertions: [{ afterProgramDay: 0, count: 1 }],
      }),
    /1 to 176/,
  );
  assert.throws(
    () =>
      buildProgramCalendar({
        startDate: "2024-01-01",
        transitionRecoveryDays: 5 as 4,
      }),
    /0 to 4/,
  );
  assert.throws(
    () =>
      buildProgramCalendar({
        startDate: "2024-01-01",
        recoveryInsertions: [{ afterProgramDay: 1, count: 0 as 1 }],
      }),
    /1 to 4/,
  );
  assert.throws(
    () =>
      buildProgramCalendar({
        startDate: "2024-01-01",
        recoveryInsertions: [{ afterProgramDay: 1, count: 5 as 4 }],
      }),
    /1 to 4/,
  );
  assert.throws(
    () =>
      buildProgramCalendar({
        startDate: "2024-01-01",
        recoveryInsertions: [
          { afterProgramDay: 8, count: 1 },
          { afterProgramDay: 8, count: 2 },
        ],
      }),
    /Only one recovery insertion/,
  );
});
