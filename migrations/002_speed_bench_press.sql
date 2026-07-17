-- Скоростной жим лёжа во вторую силовую тренировку каждого цикла V9.
-- Формат weight_text совместим с шаблоном recalcWeightText: "NN % ТМ (KK)".
-- Идемпотентно: не вставляет дубликат, если упражнение уже есть.
INSERT INTO workout_exercises (
  workout_id, sort_order, name, weight_text, target_reps, target_sets,
  target_rir_min, target_rir_max, tempo, comment, rest_seconds
)
SELECT
  ranked.id,
  COALESCE(
    (SELECT MAX(we.sort_order) FROM workout_exercises we WHERE we.workout_id = ranked.id),
    0
  ) + 1,
  'Жим лёжа — скоростной',
  '65 % ТМ (71,5)',
  '3',
  '5',
  3,
  4,
  'X-1-1',
  'Каждый повтор быстрый. 2 медленных подряд — стоп.',
  120
FROM (
  SELECT w.id, ROW_NUMBER() OVER (PARTITION BY w.cycle_id ORDER BY w.sort_order) AS rn
  FROM workouts w
  JOIN cycles c ON c.id = w.cycle_id AND c.block = 'v9'
  WHERE w.kind = 'strength'
) ranked
WHERE ranked.rn = 2
  AND NOT EXISTS (
    SELECT 1 FROM workout_exercises we2
    WHERE we2.workout_id = ranked.id
      AND we2.name = 'Жим лёжа — скоростной'
  );
