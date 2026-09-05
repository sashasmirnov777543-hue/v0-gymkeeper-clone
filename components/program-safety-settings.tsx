import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, workouts } from "@/lib/db/schema";
import { ACTIVE_PROGRAM_VERSION } from "@/lib/program/version";
import { type SafetyProfile } from "@/lib/program/policy";
import { saveSafetyProfile, reviewBase } from "@/app/actions/policy";
const field =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base";
const button =
  "min-h-12 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground";
export async function ProgramSafetySettings({
  profile,
  baseKg,
  day,
}: {
  profile: SafetyProfile;
  baseKg: number;
  day: number;
}) {
  const history = await db
    .select({
      id: sessions.id,
      date: sessions.startedAt,
      title: workouts.title,
      meta: workouts.prescription,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .where(
      and(
        eq(sessions.status, "completed"),
        eq(sessions.programVersion, ACTIVE_PROGRAM_VERSION),
        eq(workouts.kind, "strength"),
      ),
    )
    .orderBy(desc(sessions.startedAt))
    .limit(50);
  const checks: Array<[keyof SafetyProfile, string]> = [
    ["reviewed", "Индивидуальные ограничения уточнены и записаны"],
    ["baseConfirmed", "Есть недавний достоверный исходный ориентир для R"],
    ["controlEffortAllowed", "Контроль около RPE 8 согласован отдельно"],
    ["singlesAllowed", "Подготовительные синглы согласованы отдельно"],
    ["directOneRmAllowed", "Отдельный тест 1ПМ и натуживание согласованы"],
    ["confirmedAtCycle20", "В Ц20 принято повторное решение о ветке 1ПМ"],
    ["optionalLegs", "Добавлять необязательную ОФП ног в обычные циклы"],
  ];
  return (
    <>
      <section className="mt-4 rounded-2xl border border-primary/30 bg-card p-4">
        <h2 className="text-xl font-bold">Индивидуальный режим</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Универсальных уровней допуска по проценту нет. Флажки записывают ваше
          решение и не являются медицинским разрешением приложения. 115 кг —
          только пример; без подтверждённого ориентира автоматических рабочих
          весов нет.
        </p>
        <form action={saveSafetyProfile} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Рабочая база R, кг
              <input
                name="baseKg"
                type="number"
                min="1"
                max="500"
                step="0.5"
                required
                defaultValue={baseKg}
                className={field}
              />
            </label>
            <label className="text-sm">
              Личный предел C, кг
              <input
                name="loadCeilingKg"
                type="number"
                min="1"
                max="500"
                step="0.5"
                defaultValue={profile.loadCeilingKg ?? ""}
                className={field}
              />
            </label>
            <label className="text-sm">
              Шаг штанги, кг
              <select
                name="weightStepKg"
                defaultValue={profile.weightStepKg}
                className={field}
              >
                {[0.5, 1, 1.25, 2.5, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Вес грифа, кг
              <input
                name="barWeightKg"
                type="number"
                min="1"
                max="30"
                step="0.5"
                defaultValue={profile.barWeightKg}
                className={field}
              />
            </label>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Пустой C означает «числовой предел не записан», а не допуск к
            максимуму. C округляется вниз и остаётся фиксированным при изменении
            R.
          </p>
          <label className="block text-sm">
            Ограничения дыхания, натуживания, положения и индивидуальные задания
            <textarea
              name="policyNotes"
              maxLength={2000}
              defaultValue={profile.notes}
              className="mt-1 min-h-28 w-full rounded-lg border border-input bg-background p-3 text-base"
            />
          </label>
          <div className="space-y-1">
            {checks.map(([name, label]) => {
              // Решение о ветке 1ПМ по редакции 3.0 принимается повторно
              // только в окне Ц20 (дни 153–160); раньше флажок недоступен.
              const cycle20Locked =
                name === "confirmedAtCycle20" &&
                profile.confirmedAtCycle20 !== true &&
                !(day >= 153 && day <= 160);
              return (
                <label
                  key={name}
                  className={`flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed ${cycle20Locked ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    name={name}
                    defaultChecked={profile[name] === true}
                    disabled={cycle20Locked}
                    className="mt-1 size-5 shrink-0"
                  />
                  <span>
                    {label}
                    {cycle20Locked && (
                      <span className="text-muted-foreground">
                        {" "}
                        — подтверждается в Ц20 (дни 153–160), сейчас день {day}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="block text-sm">
            Итоговая ветка
            <select
              name="testBranch"
              defaultValue={profile.testBranch}
              className={field}
            >
              <option value="triple">Основная · тройка</option>
              <option value="direct_1rm">Отдельно подготовленный 1ПМ</option>
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            Выбрать до Ц17, повторно подтвердить в Ц20. Сейчас день {day}.
            Альтернативная работа заменяет основную.
          </p>
          <label className="block text-sm">
            Необязательная поддержка
            <select
              name="supportMode"
              defaultValue={profile.supportMode}
              className={field}
            >
              {[
                "0 · не добавлять",
                "1 · исходная переносимая доза",
                "2 · второй сет одного движения",
                "3 · небольшой объём",
                "4 · согласованный вариант",
                "5 · отдельно согласованное сопротивление",
                "6 · поддержание переносимого режима",
              ].map((label, n) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            Режимы 4–6 требуют конкретного задания в заметке; приложение не
            выдумывает сопротивление и показывает базовую дозу. Прогрессии по
            календарю нет.
          </p>
          <button className={button}>Сохранить индивидуальный режим</button>
        </form>
      </section>
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-xl font-bold">Пересмотр базы R</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Для +2,5 кг нужны улучшившийся сопоставимый контроль и две различные
          обычные зелёные сессии. Индекс T/0,863 не становится новой базой
          автоматически. После КТ4 вверх не менять. Консервативное снижение
          можно оформить без ожидания КТ.
        </p>
        <form action={reviewBase} className="mt-4 space-y-3">
          <label className="block text-sm">
            Предлагаемая база, кг
            <input
              name="proposedRmrefKg"
              type="number"
              min="1"
              max="500"
              step="0.5"
              defaultValue={baseKg}
              required
              className={field}
            />
          </label>
          {[
            ["controlSessionId", "Контроль", true],
            ["ordinarySessionId1", "Обычная сессия 1", false],
            ["ordinarySessionId2", "Обычная сессия 2", false],
          ].map(([name, label, isControl]) => (
            <label key={String(name)} className="block text-sm">
              {label}
              <select name={String(name)} defaultValue="" className={field}>
                <option value="">Не выбрана</option>
                {history
                  .filter(
                    (h) =>
                      Boolean(
                        (h.meta as { isControl?: boolean } | null)?.isControl,
                      ) === isControl,
                  )
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.date.toLocaleDateString("ru-RU")} · {h.title}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label className="flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed">
            <input
              type="checkbox"
              name="controlProgressConfirmed"
              className="mt-1 size-5 shrink-0"
            />
            <span>
              Сравнение контроля по паузе, технике и усилию осмысленно, прогресс
              не объясняется изменением протокола
            </span>
          </label>
          <button className={button}>Проверить данные и применить R</button>
        </form>
      </section>
    </>
  );
}
