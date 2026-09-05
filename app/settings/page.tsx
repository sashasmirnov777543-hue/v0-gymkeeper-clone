import { ProgramSafetySettings } from "@/components/program-safety-settings";
import { safetyProfile } from "@/lib/program/policy";
import { desc, eq } from "drizzle-orm";
import {
  Bot,
  CalendarDays,
  DatabaseBackup,
  HeartPulse,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  programState,
  recoveryInsertions,
  rhrMeasurements,
  rmrefReviewEvents,
} from "@/lib/db/schema";
import { BottomNav } from "@/components/bottom-nav";
import { BackupRestore } from "@/components/backup-restore";
import {
  addRecoveryDays,
  reviewAndApplyRmref,
  setClearanceLevel,
  setCurrentProgramDay,
  setProgramStartDate,
  setTestDate,
} from "@/app/actions/program";
import {
  CLEARANCE_LEVELS,
  CLEARANCE_LEVEL_LABEL,
  DEFAULT_CLEARANCE_LEVEL,
  isClearanceLevel,
  type ClearanceLevel,
} from "@/lib/program/version";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ policyError?: string }>;
}) {
  const { policyError } = await searchParams;
  const [stateRows, recoveries, rhrRows, reviews] = await Promise.all([
    db
      .select()
      .from(programState)
      .where(eq(programState.profileKey, "primary"))
      .limit(1),
    db
      .select()
      .from(recoveryInsertions)
      .orderBy(desc(recoveryInsertions.createdAt)),
    db
      .select()
      .from(rhrMeasurements)
      .orderBy(desc(rhrMeasurements.measuredOn))
      .limit(14),
    db
      .select()
      .from(rmrefReviewEvents)
      .orderBy(desc(rmrefReviewEvents.createdAt))
      .limit(10),
  ]);
  const state = stateRows[0];
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const currentRmrefKg = Number(state?.rmrefKg ?? 115);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-40 pt-5">
      <h1 className="text-2xl font-bold">Настройки программы</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Календарь, рабочая база R, индивидуальные ограничения, RHR и резервная
        копия.
      </p>

      {policyError && (
        <section
          role="alert"
          className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="text-sm font-bold text-destructive">Не применено</p>
          <p className="mt-1 text-sm leading-relaxed">{policyError}</p>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 text-primary" />
          <div>
            <h2 className="font-bold">Календарь 176 дней</h2>
            <p className="text-xs text-muted-foreground">
              Дополнительный отдых сдвигает последующие даты.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <form action={setProgramStartDate} className="contents">
            <label className="text-xs text-muted-foreground">
              Дата H2-1 P1
              <input
                name="startDate"
                type="date"
                required
                defaultValue={state?.startDate ?? ""}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2"
              />
            </label>
            <button className="mt-5 h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground">
              Сохранить старт
            </button>
          </form>
          <form action={setCurrentProgramDay} className="contents">
            <label className="text-xs text-muted-foreground">
              Текущий день
              <input
                name="programDay"
                type="number"
                min="1"
                max="176"
                defaultValue={state?.currentProgramDay ?? 1}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2"
              />
            </label>
            <button className="mt-5 h-11 rounded-lg border border-border px-3 font-semibold">
              Установить
            </button>
          </form>
          <form action={setTestDate} className="contents">
            <label className="text-xs text-muted-foreground">
              Дата теста T0
              <input
                name="testDate"
                type="date"
                defaultValue={state?.testDate ?? ""}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2"
              />
            </label>
            <button className="mt-5 h-11 rounded-lg border border-border px-3 font-semibold">
              Привязать пик
            </button>
          </form>
        </div>
        <details className="mt-4 rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Добавить 1–4 дня восстановления
          </summary>
          <form
            action={addRecoveryDays}
            className="mt-3 grid grid-cols-2 gap-3"
          >
            <label className="text-xs text-muted-foreground">
              После дня
              <input
                name="afterProgramDay"
                type="number"
                min="1"
                max="176"
                required
                defaultValue={state?.currentProgramDay ?? 1}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Дней
              <input
                name="days"
                type="number"
                min="1"
                max="4"
                required
                defaultValue="1"
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2"
              />
            </label>
            <label className="col-span-2 text-xs text-muted-foreground">
              Причина
              <input
                name="reason"
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3"
              />
            </label>
            <button className="col-span-2 min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground">
              Добавить без сжатия цикла
            </button>
          </form>
        </details>
        {recoveries.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Вставок восстановления: {recoveries.length} · всего{" "}
            {recoveries.reduce((sum, row) => sum + row.days, 0)} дн.
          </p>
        )}
      </section>

      <ProgramSafetySettings
        profile={safetyProfile(state?.safetyProfile)}
        baseKg={currentRmrefKg}
        day={state?.currentProgramDay ?? 1}
      />
      {reviews.length > 0 && (
        <section className="mt-4 rounded-xl border border-border p-4 text-sm">
          <h2 className="font-semibold">История пересмотров</h2>
          {reviews.slice(0, 5).map((row) => (
            <p key={row.id} className="mt-2">
              {row.checkpoint}: {row.previousRmrefKg} → {row.proposedRmrefKg} кг
              · {row.status}
            </p>
          ))}
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <HeartPulse className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-bold">RHR-протокол</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Первые 14 стабильных дней — ежедневно; затем минимум 4 утра в
              неделю. База — медиана 7 сопоставимых измерений.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {rhrRows.map((row) => (
            <div
              key={row.id}
              className="min-w-16 rounded-lg bg-secondary p-2 text-center"
            >
              <p className="font-mono font-bold">
                {row.repeatedBpm ?? row.bpm}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {row.measuredOn.slice(5)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className={`mt-4 rounded-2xl border p-4 ${geminiConfigured ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}
      >
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-bold">Gemini 3.5 Flash</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {geminiConfigured
                ? "Google AI Studio подключён. Чат доступен поверх всех экранов."
                : "Добавьте GEMINI_API_KEY в приватные переменные окружения Vercel/сервера. Ключ нельзя сохранять в Git или вводить в чат."}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              model: gemini-3.5-flash
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <DatabaseBackup className="size-5 text-primary" />
          <div>
            <h2 className="font-bold">Резервная копия</h2>
            <p className="text-xs text-muted-foreground">
              История, RHR, RMref, чат и подтверждённые корректировки.
            </p>
          </div>
        </div>
        <BackupRestore />
      </section>

      <BottomNav />
    </main>
  );
}
