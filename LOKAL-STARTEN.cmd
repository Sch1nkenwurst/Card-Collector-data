@echo off
title Schinkenwurst Kartenlager - lokale Entwicklung
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js und npm wurden nicht gefunden. Bitte zuerst Node.js installieren.
  pause
  exit /b 1
)
if not exist node_modules npm install
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:4173'"
npm run dev

