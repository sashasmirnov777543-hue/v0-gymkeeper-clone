# Архив инструкции предыдущей редакции

Не используйте этот файл для обновления на 3.0. Актуальная инструкция — UPGRADE-3.0.md.

# GymKeeper · H2 → V9

Mobile-first personal training tracker for the canonical **176-day H2→V9 bench-press program** (revision 1.0, 20 July 2026).

## What is included

- 22 eight-day cycles: H2 1–9 and V9 1–13
- 2/2 calendar: P1, P2, B1, B2, P3, P4, B3, B4
- extra 1–4 recovery days that shift later dates without compressing sessions
- one RMref lifecycle with 2.5 kg midpoint-down rounding
- RMref reviews only after H2-9, V9-4 and V9-8 with two comparable confirmations
- four-level readiness traffic light with a hard red stop
- conditional single gates only in V9-6, V9-7, V9-9 and V9-11
- separate V9-13 branches: default standardized triple/e1RM or separately cleared direct 1RM
- step-by-step set journal with RPE, RIR, pause, touch point, trajectory, pain, symptoms and video link
- technical-stop algorithm and no-compensation rules
- Z1/Z2 cardio journal with warm-up, main-zone and cool-down minutes separated
- RHR baseline from the median of seven comparable mornings
- offline program cache and idempotent outbox sync
- JSON backup/restore and detailed CSV export
- persistent Gemini 3.5 Flash coach dock on every authenticated screen
- AI adjustments are stored as proposals and require an explicit Confirm click

## Stack

- Next.js 16, React 19, TypeScript
- PostgreSQL + Drizzle ORM
- Tailwind CSS 4
- PWA/service worker
- Google AI Studio, model `gemini-3.5-flash`

## Environment

Copy `.env.example` into a private environment and set:

- `APP_USERNAME`
- `APP_PASSWORD`
- `SESSION_SECRET` (at least 32 random characters)
- `DATABASE_URL`
- `GEMINI_API_KEY` from Google AI Studio
- optional `GEMINI_MODEL` (defaults to `gemini-3.5-flash`)
- optional `GEMINI_BASE_URL` (defaults to Google’s official OpenAI-compatible endpoint)

Never commit real credentials.

## Install and verify

```bash
npm ci
npm run db:migrate
npm run check
npm run db:dry-run
```

`npm run check` executes lint, unit tests, typecheck and the production build. `npm run db:dry-run` validates the full migration chain against an isolated PGlite/PostgreSQL-compatible database, including idempotency, legacy joins and backup round trip.

## Database migration behavior

- `000_base_schema.sql` makes a fresh database reproducible.
- Historical migrations 001–008 are left unchanged because they may already be applied.
- `009_h2_v9_v1_schema.sql` is additive: it adds versioned program, readiness, RHR, RMref, safety-gate and coach-audit structures.
- `010_seed_h2_v9_v1.sql` performs idempotent upserts by stable program keys.
- Legacy cycles and their session/set history are not deleted.
- The active UI reads only program version `h2-v9-3.0`.

Before applying migrations to an existing deployment, download a JSON backup and a provider-level database snapshot.

## Gemini 3.5 Flash

The browser never receives the API key. Chat requests go through `/api/coach` on the server. Before the first message, the UI asks the user to acknowledge that chat and relevant training context are sent to Google AI Studio.

The model receives:

- a strict coach system prompt
- the full canonical H2→V9 program digest
- the current program position and RMref
- recent readiness/session summaries and RHR trend
- recent chat history

It cannot write directly. A suggested change must pass a local allowlist and safety validation, appears as a separate proposal card, and is applied only after the authenticated user presses **Confirm**. Red-flag text is caught by a local safety gate before the model call.

## Security action required for existing clones

An older tracked Windows migration helper contained a live database connection string. The current file no longer contains it, but deletion from the latest commit does not remove a secret from Git history.

1. Rotate/revoke the old database credential at the database provider immediately.
2. Update the private `DATABASE_URL` in the deployment.
3. If this repository has been shared or mirrored, consider purging the secret from Git history and force-pushing only after making a protected backup and coordinating with every clone.

Do not reuse the old password.

## Safety scope

This software implements a training framework, not medical clearance. It does not diagnose conditions, change medication, or authorize heavy straining, singles or direct 1RM testing. Clinical restrictions and qualified medical advice override the plan. A red readiness signal blocks training and warm-up.

## Applying with GitHub Desktop

1. Open this repository in GitHub Desktop.
2. Review the branch `feat/h2-v9-v1-overhaul`.
3. Inspect the diff and run the verification commands above.
4. Commit locally.
5. Publish the branch or open a pull request only after reviewing migration and environment settings.

## Редакция 2.1 программы

Приложение работает по редакции 2.1 жимовой программы (`lib/program/h2-v9-v3.json`,
версия `h2-v9-3.0`). Структура не изменилась: 176 дней, 22 восьмидневных цикла,
9 циклов гипертрофии (`h2-1…h2-9`) и 13 силовых (`v9-1…v9-13`), тот же календарь пика,
`lib/program/calendar.ts` не менялся.

Редакция 2.1 не переписывает программу — она чинит то, что в 2.0 расходилось
с собственными заявлениями.

| Что | 2.0 | 2.1 |
|---|---|---|
| Прогрессия между контрольными точками | нет | рабочая надбавка Δ |
| Авторегуляция | только вниз | вверх и вниз |
| Источник целевого RPE | номинальный процент | вес на штанге |
| Значения RPE вне шкалы | зажимались в 4 и 8 | цели нет, помечено `belowScale` |
| Потолок RPE 8 в валидаторе | зажимался до проверки | проверяется независимым расчётом |
| Потолок допуска в шлюзе | подпись в процентах | килограммы на штанге |
| Базовый замер | коридор ±5 кг | задаёт RMref свободно |
| Ц12/Ц15 и Ц13/Ц16 | дословные повторы | разведены по схеме |
| Пиковый сингл Ц21 | 107,5 кг = 93,5%, выше Уровня 2 | убран, ветка C возвращает 102,5 кг |
| Реаб-блок | один набор на 176 дней | шесть ступеней, шаг раз в 3 цикла |
| Длинная Z2-сессия | B1, перед главным днём | B3, перед лёгким |
| Нижняя граница шкалы усилия | RPE 6 | RPE 4 |
| Сетов ≥80% в неделю (силовой блок) | 4,5 | 5,1 |

Подробный разбор каждого пункта — в `CHANGELOG-2.1.md`.

### Как пересобрать данные программы

```bash
node scripts/build-program-v3.mjs     # спецификация -> lib/program/h2-v9-v3.json
node scripts/verify-program-v3.mjs    # 15 групп проверок соответствия программе
npm run program:generate              # JSON -> migrations/014_seed_h2_v9_v3.sql
npm run db:migrate                    # применить миграции
```

`scripts/verify-program-v3.mjs` — основная защита от расхождения кода и программы.
Он проверяет каркас, шесть контрольных точек, потолок RPE 8, дозу работы ≥80%,
расположение синглов, календарь пика, наличие жима в обоих зальных днях, конверсии
процент→килограмм, словарь ролей, покрытие гайдами — и, начиная с 2.1, ещё пять групп:
пересчёт RPE от веса на штанге, совпадение текста заметок с записанной целью, потолок
допуска по килограммам, отсутствие повторяющихся силовых циклов, порядок кардио-дней
и шесть ступеней реаб-блока.

Генератор больше не зажимает RPE: если спецификация выводит подход за потолок 8,
`build-program-v3.mjs` печатает список нарушителей и завершается с ненулевым кодом.

### Рабочая надбавка Δ

`lib/program/delta.ts`. Между контрольными точками вес следует за фактическим RPE,
а не за календарём: если на зелёном статусе последний рабочий подход вышел на 0,5 RPE
ниже цели, надбавка растёт на 2,5 кг. Не чаще одного повышения за цикл, не в разгрузках,
коридор ±10 кг. Превышение цели или две несделанные сессии подряд опускают надбавку,
и это работает в любом цикле. На контрольной точке Δ сворачивается в новый RMref
и обнуляется.

Инвариант — целевой RPE, а не килограмм. Если надбавка завышена, RPE придёт выше цели,
и то же правило откатит вес на следующей сессии.

### Совместимость с данными прошлых редакций

Уникальные индексы `workouts.program_key` и `workout_exercises.program_key` не версионированы,
поэтому ключи редакции 2.1 идут с префиксом `v3:` (у 2.0 был `v2:`, у 1.0 префикса нет).
Строки прошлых редакций и вся история сессий остаются нетронутыми: миграции только
аддитивные, ни одного `DELETE`, `TRUNCATE` или `DROP TABLE`.
