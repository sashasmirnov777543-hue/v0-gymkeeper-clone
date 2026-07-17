-- 002: изменения программы по итогам разбора V9/V10.1

-- 1) Скоростной жим во вторую силовую тренировку каждого цикла V9
WITH second_strength AS (
  SELECT t.id, t.macrocycle
  FROM (
    SELECT w.id,
           c.macrocycle,
           ROW_NUMBER() OVER (PARTITION BY w.cycle_id ORDER BY w.sort_order) AS rn
    FROM workouts w
    JOIN cycles c ON c.id = w.cycle_id
    WHERE c.block = 'v9' AND w.kind = 'strength'
  ) t
  WHERE t.rn = 2
),
tm AS (
  SELECT ss.id AS workout_id,
         ROUND(0.65 * COALESCE(s.value::numeric,
             CASE ss.macrocycle WHEN 1 THEN 110 WHEN 2 THEN 113 ELSE 116 END
         ) / 2.5) * 2.5 AS speed_weight
  FROM second_strength ss
  LEFT JOIN app_settings s ON s.key = 'tm_macro' || ss.macrocycle
)
INSERT INTO workout_exercises
  (workout_id, sort_order, name, weight_text, target_reps, target_sets,
   target_rir_min, target_rir_max, tempo, rest_seconds, comment)
SELECT tm.workout_id,
       -1,
       'Жим лёжа — скоростной',
       '65 % ТМ (' || REPLACE(TRIM(TRAILING '.' FROM TO_CHAR(tm.speed_weight, 'FM999990.9')), '.', ',') || ')',
       '3', '5', 3, 4, 'X-1-1', 120,
       'Каждый повтор быстрый, грайндов нет. Медленный повтор — стоп.'
FROM tm
WHERE NOT EXISTS (
  SELECT 1 FROM workout_exercises we
  WHERE we.workout_id = tm.workout_id AND we.name = 'Жим лёжа — скоростной'
);

-- 2) Циклы H2 после пятого — опциональные
UPDATE cycles
SET notes = COALESCE(notes || ' · ', '') || 'Опционально: рекомендуется завершить блок за 5 циклов и перейти в силовой'
WHERE block = 'h2'
  AND number > 5
  AND COALESCE(notes, '') NOT LIKE '%Опционально%';
