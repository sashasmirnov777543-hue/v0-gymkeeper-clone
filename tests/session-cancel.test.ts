import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Отмена начатой сессии должна быть в обоих типах тренировок.
 *
 * В силовой она была с самого начала, в кардио — не было вовсе: начатую по ошибке
 * сессию нельзя было убрать, она оставалась активной. Тест текстовый, потому что
 * в проекте нет рендер-тестов компонентов, а пропажу кнопки поймать надо.
 */

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const STRENGTH = "components/session-logger.tsx";
const CARDIO = "components/cardio-session.tsx";

test("обе сессии дают отменить начатую тренировку", () => {
  for (const path of [STRENGTH, CARDIO]) {
    const source = read(path);
    assert.match(source, /Отменить тренировку/, `${path}: нет кнопки отмены`);
    assert.match(source, /cancelSession/, `${path}: не вызывает серверную отмену`);
    assert.match(source, /cancelLocalSession/, `${path}: не отменяет офлайн-сессию`);
    assert.match(source, /kind: "cancel"/, `${path}: не кладёт отмену в очередь при офлайне`);
  }
});

test("отмена спрашивает подтверждение — записанное удаляется безвозвратно", () => {
  for (const path of [STRENGTH, CARDIO]) {
    assert.match(read(path), /confirm\(/, `${path}: отмена без подтверждения`);
  }
});

test("на красном статусе кардио всё ещё можно отменить", () => {
  // Раньше вся нижняя панель кардио пряталась при blocked, вместе с отменой:
  // сессия, начатая до появления стоп-сигнала, оставалась активной навсегда.
  const source = read(CARDIO);
  const footer = source.slice(source.indexOf("fixed inset-x-0 bottom-0"));
  assert.doesNotMatch(
    source,
    /\{!readOnly && !blocked && \(\s*<div className="fixed inset-x-0 bottom-0/,
    "панель целиком спрятана на красном статусе",
  );
  assert.match(footer, /Отменить тренировку/, "в подвале нет кнопки отмены");
  // Управление таймером на красном по-прежнему скрыто — тренироваться нельзя.
  assert.match(footer, /\{!blocked && \(/, "таймер должен скрываться на красном статусе");
  assert.ok(
    footer.indexOf("Отменить тренировку") > footer.indexOf("{!blocked && ("),
    "отмена должна быть вне блока, скрываемого на красном статусе",
  );
});
