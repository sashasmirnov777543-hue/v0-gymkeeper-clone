@echo off
setlocal
cd /d "%~dp0"

if "%DATABASE_URL%"=="" (
  echo [ERROR] DATABASE_URL is not set.
  echo Set it in your private environment before running this script.
  echo Never paste database credentials into this repository.
  pause
  exit /b 1
)

if not exist "scripts\migrate.mjs" (
  echo [ERROR] scripts\migrate.mjs not found.
  pause
  exit /b 1
)

echo Running all pending versioned migrations...
node scripts\migrate.mjs
if errorlevel 1 (
  echo.
  echo Migration failed. No further action was taken.
  pause
  exit /b 1
)

echo.
echo Migrations completed successfully.
pause
endlocal
