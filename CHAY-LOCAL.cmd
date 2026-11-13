@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Can cai Node.js 22.13 tro len tu https://nodejs.org/
  pause
  exit /b 1
)
node scripts\start-local.mjs local
pause
