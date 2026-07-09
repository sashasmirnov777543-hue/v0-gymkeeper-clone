import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import { appSettings, tmRecalcEvents } from "@/lib/db/schema";
import { BottomNav } from "@/components/bottom-nav";
import { BackupRestore } from "@/components/backup-restore";
import {
  recalculateLastAmrap,
  saveManualTm,
  undoLastTmChange,
} from "@/app/actions/tm-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  await ensureSchema();
  const params = await searchParams;
  const [settingsRows, events] = await Promise.all([
    db.select().from(appSettings),
    db
      .select()
      .from(tmRecalcEvents)
      .orderBy(desc(tmRecalcEvents.createdAt))
      .limit(10),
  ]);
  const settings = Object.fromEntries(
    settingsRows.map((row) => [row.key, row.value]),
  );

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-5">
      <h1 className="text-2xl font-bold">Настройки TM</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ручное управление, повторный расчёт и история изменений.
      </p>

      {params.message && (
        <p className="mt-4 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          {params.message}
        </p>
      )}
      {params.error && (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {params.error}
        </p>
      )}

      <section className="mt-5 space-y-3">
        {[1, 2, 3].map((macro) => (
          <form
            key={macro}
            action={saveManualTm}
            className="flex items-end gap-3 rounded-xl border border-border bg-card p-4"
          >
            <input type="hidden" name="macro" value={macro} />
            <label className="flex-1 text-sm font-medium">
              TM Макро {macro}, кг
              <input
                name="tm"
                type="number"
                inputMode="decimal"
                step="2.5"
                min="20"
                max="300"
                defaultValue={
                  settings[`tm_macro${macro}`] ??
                  (macro === 1 ? "110" : macro === 2 ? "112.5" : "116")
                }
                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-lg font-semibold"
              />
            </label>
            <button className="h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
              Сохранить
            </button>
          </form>
        ))}
      </section>

      <section className="mt-5 grid gap-3">
        <form action={recalculateLastAmrap}>
          <button className="w-full rounded-xl border border-border bg-card p-4 text-left font-semibold">
            Пересчитать последний AMRAP
          </button>
        </form>
        <form action={undoLastTmChange}>
          <button className="w-full rounded-xl border border-destructive/40 bg-card p-4 text-left font-semibold text-destructive">
            Отменить последний пересчёт TM
          </button>
        </form>
      </section>

      <section className="mt-7">
        <h2 className="text-lg font-bold">История TM</h2>
        <div className="mt-3 space-y-2">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">История пока пуста.</p>
          )}
          {events.map((event) => (
            <div
              key={event.sessionId}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <div className="flex justify-between gap-3">
                <strong>Макро {event.targetMacro}</strong>
                <span>{event.createdAt.toLocaleDateString("ru-RU")}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                AMRAP {event.amrapWeight} × {event.amrapReps} → e1RM{" "}
                {event.e1rm} кг
              </p>
              <p>
                {event.oldTm ?? "—"} → <strong>{event.newTm} кг</strong> ·
                обновлено {event.updatedExercises}
              </p>
            </div>
          ))}
        </div>
      </section>

      <BackupRestore />
      <BottomNav />
    </main>
  );
}
