-- 003: скоростной жим всегда первый в своей тренировке
UPDATE workout_exercises we
SET sort_order = sub.min_order - 1
FROM (
  SELECT workout_id, MIN(sort_order) AS min_order
  FROM workout_exercises
  WHERE name <> 'Жим лёжа — скоростной'
  GROUP BY workout_id
) sub
WHERE we.workout_id = sub.workout_id
  AND we.name = 'Жим лёжа — скоростной'
  AND we.sort_order >= sub.min_order;
