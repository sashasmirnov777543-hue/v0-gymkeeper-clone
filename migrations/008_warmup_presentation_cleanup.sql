-- 008: исправление отображения разминки и регистра заголовков.
-- История, рабочие веса и выполненные подходы не меняются.

UPDATE workout_exercises AS exercise
SET target_rir_min = NULL,
    target_rir_max = NULL
FROM workouts AS workout
JOIN cycles AS cycle ON cycle.id = workout.cycle_id
WHERE exercise.workout_id = workout.id
  AND cycle.block IN ('h2', 'v9')
  AND exercise.name IN (
    'Общий разогрев',
    'Плечевой блок',
    'Жимовая лестница',
    'Разминочная лестница',
    'Разминка гантелей'
  );

UPDATE workouts AS workout
SET title = upper(left(workout.title, 1)) || substring(workout.title FROM 2)
FROM cycles AS cycle
WHERE workout.cycle_id = cycle.id
  AND cycle.block IN ('h2', 'v9')
  AND workout.title <> '';
