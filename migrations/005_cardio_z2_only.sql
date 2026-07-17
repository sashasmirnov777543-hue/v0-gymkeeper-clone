-- 005: кардио Z2-only — без интервалов 4×4
-- B1 = первая кардио-тренировка цикла (длинная Z2), B3 = вторая (восстановительная)
WITH ranked AS (
  SELECT w.id,
         c.number AS cycle_number,
         ROW_NUMBER() OVER (PARTITION BY w.cycle_id ORDER BY w.sort_order, w.id) AS rn
  FROM workouts w
  JOIN cycles c ON c.id = w.cycle_id
  WHERE c.block = 'v9' AND w.kind = 'cardio'
)
UPDATE workouts w SET
  title = CASE
    WHEN r.rn = 1 THEN 'Кардио B1 — длинная Z2 (растяжка сердца)'
    ELSE 'Кардио B3 — Z2 восстановление'
  END,
  cardio_zone = CASE
    WHEN r.cycle_number >= 11 THEN 'Z1'
    WHEN r.cycle_number = 10 THEN 'Z1–Z2'
    ELSE 'Z2'
  END,
  cardio_minutes = CASE
    WHEN r.rn = 1 THEN CASE
      WHEN r.cycle_number <= 2 THEN '40–50'
      WHEN r.cycle_number <= 4 THEN '60–70'
      WHEN r.cycle_number <= 7 THEN '50–60'
      WHEN r.cycle_number = 8 THEN '40–50'
      WHEN r.cycle_number = 9 THEN '30'
      WHEN r.cycle_number = 10 THEN '15–20'
      WHEN r.cycle_number <= 12 THEN '15'
      ELSE '—'
    END
    ELSE CASE
      WHEN r.cycle_number <= 8 THEN '25–30'
      WHEN r.cycle_number = 9 THEN '20–25'
      WHEN r.cycle_number = 10 THEN '15–20'
      ELSE '—'
    END
  END,
  notes = CASE
    WHEN r.cycle_number = 13 THEN 'Неделя теста 1ПМ: полный отдых или прогулка 30 мин по желанию. Без жаркой/длинной сауны накануне теста.'
    WHEN r.cycle_number >= 11 THEN 'Пик/тейпер: только лёгкая Z1 или прогулка — свежесть ЦНС важнее объёма кардио.'
    WHEN r.rn = 1 AND r.cycle_number IN (3, 4) THEN 'Только Z2 — разговорный темп (полными предложениями говорить можно, петь нет). Велосипед или эллипс. Перед тяжёлым днём А — потолок 60 мин. Плохой сон или пульс покоя +5 уд/мин → срезать до 30 мин или заменить прогулкой. Опционально 1 раз за цикл: финишер 4–5 мин Z3 (комфортно тяжело) в конце — только при хорошем самочувствии.'
    WHEN r.rn = 1 THEN 'Только Z2 — разговорный темп (полными предложениями говорить можно, петь нет). Велосипед или эллипс, без интервалов. Перед тяжёлым днём А — потолок 60 мин. Плохой сон или пульс покоя +5 уд/мин → срезать до 30 мин или заменить прогулкой.'
    ELSE 'Z2 восстановительная: разговорный темп, без интервалов. По самочувствию можно заменить прогулкой. Вечером хорошо для сна.'
  END
FROM ranked r
WHERE w.id = r.id;

-- Вычистить упоминания интервалов 4×4 из заметок циклов
UPDATE cycles
SET notes = REPLACE(REPLACE(notes, ' + иногда 4×4 за цикл', ''), '4×4', 'Z2 без интервалов')
WHERE block = 'v9' AND notes LIKE '%4×4%';
