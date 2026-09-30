@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Vui long tai ban LTS tai https://nodejs.org , cai xong roi bam dup lai file nay.
  pause
  exit /b
)
echo Dang khoi dong Cham cong Dahahi... Giu cua so nay mo trong luc dung app.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
