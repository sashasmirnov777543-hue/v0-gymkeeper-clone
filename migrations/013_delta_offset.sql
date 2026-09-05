-- 013: Схема под редакцию 2.1 жимовой программы — рабочая надбавка Δ.
-- Только аддитивные изменения: ни одна строка не удаляется, история сессий не трогается.

-- Рабочая надбавка Δ — непрерывная прогрессия между контрольными точками.
--
-- Редакция 2.0 умела только тормозить: жёлтый статус снимал 2,5–5%, а правила
-- повышения веса не было ни в одном разделе. Внутри силового блока это давало
-- одно рабочее обновление базы с потолком +5 кг, то есть максимум +4,3% роста
-- нагрузки при заявленном результате +6…9%.
--
-- Δ хранит разрыв между RMref и фактической силой. Печатный килограмм = план + Δ.
-- Инвариант — целевой RPE, а не вес.
ALTER TABLE program_state
  ADD COLUMN IF NOT EXISTS delta_offset_kg NUMERIC NOT NULL DEFAULT 0;

-- Цикл, в котором надбавка последний раз повышалась: не чаще одного шага за цикл.
ALTER TABLE program_state
  ADD COLUMN IF NOT EXISTS delta_last_raised_cycle_key TEXT;

-- Коридор ±10 кг между контрольными точками. Ниже −5 кг продолжать по плану нельзя:
-- нужна досрочная контрольная точка, а не дальнейшее сползание.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_state_delta_offset_check'
  ) THEN
    ALTER TABLE program_state
      ADD CONSTRAINT program_state_delta_offset_check
      CHECK (delta_offset_kg >= -10 AND delta_offset_kg <= 10);
  END IF;
END $$;

-- Журнал изменений надбавки. Нужен, чтобы на контрольной точке отличить рост силы
-- от дрейфа оценок RPE: если Δ рос, а калибровочная тройка нет, дело в оценках.
CREATE TABLE IF NOT EXISTS delta_offset_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cycle_key TEXT,
  session_id BIGINT,
  direction TEXT NOT NULL,
  previous_kg NUMERIC NOT NULL,
  next_kg NUMERIC NOT NULL,
  target_last_set_rpe NUMERIC,
  actual_last_set_rpe NUMERIC,
  readiness_green BOOLEAN,
  reason TEXT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delta_offset_events_direction_check'
  ) THEN
    ALTER TABLE delta_offset_events
      ADD CONSTRAINT delta_offset_events_direction_check
      CHECK (direction IN ('up', 'down', 'hold', 'fold'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS delta_offset_events_created_at_idx
  ON delta_offset_events (created_at DESC);

-- Активная версия программы переключается на редакцию 2.1.
-- Строки редакций 1.0 и 2.0 остаются в таблицах: у них другой program_version
-- и другие program_key (префиксы отсутствуют и v2:), поэтому сессии из истории
-- продолжают резолвиться.
INSERT INTO app_settings (key, value)
VALUES ('active_program_version', 'h2-v9-3.0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
