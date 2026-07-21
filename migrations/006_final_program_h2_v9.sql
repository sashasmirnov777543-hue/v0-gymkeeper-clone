-- 006 legacy placeholder.
-- The previous revision attempted to seed H2/V9 from table OCR and contained
-- corrupted prescriptions. Existing databases that already applied migration 006
-- keep those rows for historical session joins. Fresh databases receive the
-- validated, versioned program from migrations 009 and 010.
--
-- Do not insert or rewrite program rows here.
SELECT 1;
