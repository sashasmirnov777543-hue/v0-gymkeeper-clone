@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Gymkeeper: исправленный установщик оформления V2 ===
echo.
if not exist "package.json" (
  echo ОШИБКА: положите BAT и apply-ui-polish-v2.mjs рядом с package.json.
  pause
  exit /b 1
)
if not exist "apply-ui-polish-v2.mjs" (
  echo ОШИБКА: рядом не найден apply-ui-polish-v2.mjs.
  pause
  exit /b 1
)
node apply-ui-polish-v2.mjs
if errorlevel 1 (
  echo.
  echo Ошибка применения. Ничего не коммитьте и пришлите весь вывод.
  pause
  exit /b 1
)
echo.
echo Проверяю TypeScript...
call npm run typecheck
if errorlevel 1 (
  echo.
  echo TypeScript нашёл ошибку. Ничего не коммитьте и пришлите весь вывод.
  pause
  exit /b 1
)
echo.
echo ГОТОВО. Откройте GitHub Desktop, проверьте изменения, Commit to main и Push origin.
echo Затем примените миграцию 007 через scripts\migrate.mjs.
pause
