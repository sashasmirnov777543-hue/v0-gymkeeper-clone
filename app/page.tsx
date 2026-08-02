import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import {
  Activity,
  ArrowRight,
  BedDouble,
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  HeartPulse,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  coachProposals,
  cycles,
  programState,
  recoveryInsertions,
  rhrMeasurements,
  sessions,
  workouts,
} from "@/lib/db/schema";
import { BottomNav } from "@/components/bottom-nav";
import { AppVersion } from "@/components/app-version";
import { setProgramStartDate, saveRhrMeasurement } from "@/app/actions/program";
import {
  CYCLE_SLOTS,
  buildProgramCalendar,
  getCurrentOrNextItem,
  getProgramDayDescriptor,
  getTodayItem,
} from "@/lib/program/calendar";
import { assessRhrTrend } from "@/lib/rhr";
import { ACTIVE_PROGRAM_VERSION } from "@/lib/program/version";

export const dynamic = "force-dynamic";
const PROGRAM_VERSION: string = ACTIVE_PROGRAM_VERSION;

function torontoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function HomePage() {
  const [stateRows, insertions, allCycles, allWorkouts, sessionRows, rhrRows, pending] =
    await Promise.all([
      db.select().from(programState).where(eq(programState.profileKey, "primary")).limit(1),
      db.select().from(recoveryInsertions).orderBy(asc(recoveryInsertions.afterProgramDay)),
      db
        .select()
        .from(cycles)
        .where(eq(cycles.programVersion, PROGRAM_VERSION))
        .orderBy(asc(cycles.sortOrder)),
      db.select().from(workouts).orderBy(asc(workouts.sortOrder)),
      db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(300),
      db.select().from(rhrMeasurements).orderBy(desc(rhrMeasurements.measuredOn)).limit(30),
      db
        .select({ id: coachProposals.id })
        .from(coachProposals)
        .where(eq(coachProposals.status, "pending")),
    ]);
  const state = stateRows[0];
  const cycleIds = new Set(allCycles.map((cycle) => cycle.id));
  const programWorkouts = allWorkouts.filter((workout) => cycleIds.has(workout.cycleId));
  const workoutIds = new Set(programWorkouts.map((workout) => workout.id));
  const programSessions = sessionRows.filter((session) => workoutIds.has(session.workoutId));
  const completedWorkoutIds = new Set(
    programSessions
      .filter((session) => session.status === "completed")
      .map((session) => session.workoutId),
  );
  const activeSession = programSessions.find((session) => session.status === "active") ?? null;
  const today = torontoDate();
  const calendar = state?.startDate
    ? buildProgramCalendar({
        startDate: state.startDate,
        t0Date: state.testDate ?? undefined,
        recoveryInsertions: insertions.map((item) => ({
          afterProgramDay: item.afterProgramDay,
          count: item.days as 1 | 2 | 3 | 4,
          label: item.reason ?? undefined,
        })),
      })
    : null;
  const todayItem = calendar ? getTodayItem(calendar, today) : null;
  const currentOrNext = calendar ? getCurrentOrNextItem(calendar, today) : null;
  const fallbackDay = Math.min(176, Math.max(1, state?.currentProgramDay ?? 1));
  const currentProgramDay =
    currentOrNext?.kind === "program" ? currentOrNext.programDay : fallbackDay;
  const descriptor = getProgramDayDescriptor(currentProgramDay);
  const currentCycle = allCycles.find(
    (cycle) => cycle.block === descriptor.block && cycle.number === descriptor.cycle,
  );
  const currentCycleWorkouts = currentCycle
    ? programWorkouts
        .filter((workout) => workout.cycleId === currentCycle.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const orderedWorkouts = allCycles.flatMap((cycle) =>
    programWorkouts
      .filter((workout) => workout.cycleId === cycle.id)
      .map((workout) => ({
        workout,
        cycle,
        programDay: (cycle.dayOffset ?? 0) + (workout.dayInCycle ?? 0),
      }))
      .sort((a, b) => a.programDay - b.programDay),
  );
  const next =
    orderedWorkouts.find(
      ({ workout, programDay }) =>
        programDay >= currentProgramDay && !completedWorkoutIds.has(workout.id),
    ) ?? null;
  const rhr = assessRhrTrend(
    rhrRows.map((row) => ({
      measuredOn: row.measuredOn,
      bpm: row.bpm,
      repeatedBpm: row.repeatedBpm,
      comparable: row.comparable,
      poorWellbeing: row.poorWellbeing,
    })),
  );
  const progressPercent = Math.round((currentProgramDay / 176) * 100);

  if (!state?.startDate) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-40 pt-8">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">H2 → V9 · 176 дней</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Настроить календарь программы</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Выберите дату P1 первого цикла H2. Приложение построит все 22 восьмидневных цикла; дополнительные дни восстановления будут сдвигать календарь, а не сжимать его.
        </p>
        <form action={setProgramStartDate} className="mt-6 rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-medium">Дата H2-1 P1
            <input name="startDate" type="date" required defaultValue={today} className="mt-2 h-12 w-full rounded-lg border border-input bg-background px-3 text-base" />
          </label>
          <button className="mt-4 min-h-12 w-full rounded-lg bg-primary px-4 font-bold text-primary-foreground">Построить 176-дневный календарь</button>
        </form>
        <BottomNav />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-primary">{descriptor.block.toUpperCase()} · цикл {descriptor.cycle}/ {descriptor.block === "h2" ? 9 : 13}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">День {currentProgramDay} из 176</h1>
              <p className="mt-1 text-sm text-muted-foreground">{currentCycle?.name ?? "Программа H2→V9"}</p>
            </div>
            <div className="rounded-xl bg-secondary px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">RMref</p>
              <p className="font-mono text-lg font-bold">{Number(state.rmrefKg)} кг</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={currentProgramDay} aria-valuemin={1} aria-valuemax={176}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{progressPercent}% цикла</span><span>{completedWorkoutIds.size} / 88 сессий</span></div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {activeSession && (
          <Link href={`/session/${activeSession.id}`} className="flex min-h-14 items-center justify-between rounded-xl bg-primary px-4 font-semibold text-primary-foreground">
            <span>Продолжить активную тренировку</span><ArrowRight className="size-5" />
          </Link>
        )}

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              {todayItem?.kind === "recovery" || descriptor.slot.startsWith("P") ? <BedDouble className="size-5" /> : descriptor.slot === "B1" || descriptor.slot === "B3" ? <Bike className="size-5" /> : <Dumbbell className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Сегодня · {dateLabel(today)}</p>
              {todayItem?.kind === "recovery" ? (
                <><h2 className="mt-1 text-xl font-bold">Дополнительное восстановление</h2><p className="mt-1 text-sm text-muted-foreground">{todayItem.label ?? "Сон, питание и обычная активность. Ничего не догонять."}</p></>
              ) : descriptor.slot.startsWith("P") ? (
                <><h2 className="mt-1 text-xl font-bold">{descriptor.slot} · рабочая смена</h2><p className="mt-1 text-sm text-muted-foreground">Силовой работы нет. Сон и восстановление важнее шагов и необязательной активности.</p></>
              ) : next ? (
                <><h2 className="mt-1 text-xl font-bold">{next.workout.title}</h2><p className="mt-1 text-sm text-muted-foreground">{next.cycle.block.toUpperCase()}-{next.cycle.number} · {next.workout.label} · день {next.programDay}</p></>
              ) : (
                <h2 className="mt-1 text-xl font-bold">Программа завершена</h2>
              )}
            </div>
          </div>
          {!activeSession && next && !descriptor.slot.startsWith("P") && (
            <Link href={`/workout/${next.workout.id}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-bold text-primary-foreground">
              Открыть план сессии <ArrowRight className="size-4" />
            </Link>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Текущий восьмидневный цикл</p><h2 className="mt-0.5 font-bold">P1 → P2 → B1 → B2 → P3 → P4 → B3 → B4</h2></div>
            <CalendarDays className="size-5 text-primary" />
          </div>
          <div className="mt-4 grid grid-cols-8 gap-1.5">
            {CYCLE_SLOTS.map((slot, index) => {
              const workout = currentCycleWorkouts.find((item) => item.label === slot);
              const done = workout ? completedWorkoutIds.has(workout.id) : false;
              const current = descriptor.slot === slot;
              return (
                <div key={slot} className={`flex aspect-square items-center justify-center rounded-lg border font-mono text-[11px] font-bold ${current ? "border-primary bg-primary text-primary-foreground" : done ? "border-success/40 bg-success/10 text-success" : "border-border bg-secondary/50 text-muted-foreground"}`} title={`День ${index + 1}`}>
                  {done ? <CheckCircle2 className="size-4" /> : slot}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-4 ${rhr.yellowSignal ? "border-warning/50 bg-warning/10" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between"><HeartPulse className="size-5 text-primary" /><span className="text-xs text-muted-foreground">RHR</span></div>
            <p className="mt-3 font-mono text-2xl font-bold">{rhr.latest ?? "—"}</p>
            <p className="text-xs text-muted-foreground">база {rhr.baseline ?? "—"} · Δ {rhr.delta == null ? "—" : `${rhr.delta >= 0 ? "+" : ""}${rhr.delta}`}</p>
            {rhr.yellowSignal && <p className="mt-2 text-xs font-medium text-warning">Минимум жёлтый вместе с плохим самочувствием.</p>}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between"><ShieldCheck className="size-5 text-primary" /><span className="text-xs text-muted-foreground">Безопасность</span></div>
            <p className="mt-3 text-sm font-semibold">Светофор перед каждой сессией</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Красный статус полностью блокирует запуск. Синглы имеют отдельный шлюз.</p>
          </div>
        </section>

        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer font-semibold">Записать утренний RHR</summary>
          <form action={saveRhrMeasurement} className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Дата<input name="measuredOn" type="date" defaultValue={today} required className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2 text-sm" /></label>
            <label className="text-xs text-muted-foreground">RHR<input name="bpm" type="number" min="30" max="220" required className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2 text-sm" /></label>
            <label className="text-xs text-muted-foreground">Повтор через 5 мин<input name="repeatedBpm" type="number" min="30" max="220" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2 text-sm" /></label>
            <div className="space-y-1 pt-4 text-sm"><label className="flex gap-2"><input name="comparable" type="checkbox" defaultChecked /> Сопоставимое утро</label><label className="flex gap-2"><input name="poorWellbeing" type="checkbox" /> Плохое самочувствие</label></div>
            <label className="col-span-2 text-xs text-muted-foreground">Заметка<input name="notes" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
            <button className="col-span-2 min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Сохранить RHR</button>
          </form>
        </details>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3"><Activity className="size-5 text-primary" /><div><h2 className="font-bold">Gemini 3.5 Flash всегда рядом</h2><p className="text-xs text-muted-foreground">Чат закреплён над навигацией. {pending.length > 0 ? `Ожидают подтверждения: ${pending.length}.` : "Корректировки без вашего подтверждения не применяются."}</p></div></div>
        </section>

        {calendar && (
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="rounded-xl border border-border bg-card p-3"><Clock3 className="mb-2 size-4 text-primary" />Старт<br /><strong className="text-foreground">{dateLabel(calendar.startDate)}</strong></div>
            <div className="rounded-xl border border-border bg-card p-3"><CalendarDays className="mb-2 size-4 text-primary" />Тест T0<br /><strong className="text-foreground">{dateLabel(calendar.t0Date)}</strong></div>
          </div>
        )}
        <AppVersion />
      </main>
      <BottomNav />
    </div>
  );
}
