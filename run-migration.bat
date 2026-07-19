@echo off
cd /d "%~dp0"
if not exist "migrations\006_final_program_h2_v9.sql" (
  echo [ERROR] File migrations\006_final_program_h2_v9.sql not found!
  echo Copy the SQL file into the migrations folder first.
  pause
  exit /b 1
)
set "DATABASE_URL=postgresql://neondb_owner:npg_JI6iwCqpB9jW@ep-morning-pond-apahew2z-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
echo Running migrations...
node scripts\migrate.mjs
echo.
echo Done. Check output above for errors.
pause
