-- 007: меняется только представление программы; история и тренировки не затрагиваются.
UPDATE cycles
SET macrocycle = CASE
  WHEN block = 'h2' AND number BETWEEN 1 AND 5 THEN 1
  WHEN block = 'h2' AND number BETWEEN 6 AND 8 THEN 2
  WHEN block = 'h2' AND number = 9 THEN 3
  WHEN block = 'v9' AND number BETWEEN 1 AND 4 THEN 1
  WHEN block = 'v9' AND number BETWEEN 5 AND 8 THEN 2
  WHEN block = 'v9' AND number BETWEEN 9 AND 13 THEN 3
  ELSE macrocycle
END
WHERE block IN ('h2', 'v9');

UPDATE cycles
SET name = regexp_replace(name, '^Цикл [0-9]+ — ', '')
WHERE block IN ('h2', 'v9') AND name ~ '^Цикл [0-9]+ — ';
