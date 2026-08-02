-- 011: Схема под редакцию 2.0 жимовой программы.
-- Только аддитивные изменения: ни одна строка не удаляется, история сессий не трогается.

-- Уровень медицинского допуска. Определяет потолок интенсивности и доступность
-- условных синглов и ветки прямого 1ПМ. По умолчанию самый консервативный.
ALTER TABLE program_state
  ADD COLUMN IF NOT EXISTS clearance_level TEXT NOT NULL DEFAULT 'level_1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_state_clearance_level_check'
  ) THEN
    ALTER TABLE program_state
      ADD CONSTRAINT program_state_clearance_level_check
      CHECK (clearance_level IN ('level_1', 'level_2', 'level_3'));
  END IF;
END $$;

-- Журнал пересчёта RMref теперь хранит вес калибровочной тройки, из которого он выведен.
ALTER TABLE rmref_review_events
  ADD COLUMN IF NOT EXISTS calibration_triple_kg NUMERIC;

-- Активная версия программы переключается на редакцию 2.0.
-- Строки редакции 1.0 остаются в таблицах: у них другой program_version и другие
-- program_key (без префикса v2:), поэтому сессии из истории продолжают резолвиться.
INSERT INTO app_settings (key, value)
VALUES ('active_program_version', 'h2-v9-2.0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO program_state (profile_key, program_version, clearance_level)
VALUES ('primary', 'h2-v9-2.0', 'level_1')
ON CONFLICT (profile_key) DO UPDATE
  SET program_version = 'h2-v9-2.0',
      clearance_level = COALESCE(program_state.clearance_level, 'level_1'),
      updated_at = NOW();
