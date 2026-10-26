@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Nova
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js не найден.
  echo   Установите Node.js LTS с сайта https://nodejs.org и запустите этот файл ещё раз.
  echo.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node server.js
pause
