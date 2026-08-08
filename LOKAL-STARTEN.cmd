@echo off
title Card Collector - lokale Testversion
cd /d "%~dp0"
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:4173'"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

