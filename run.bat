@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title SonicStrip - Video to Audio Converter

echo ===================================================
echo   ⚡ SonicStrip Video-to-Audio Studio
echo ===================================================
echo Checking for available network port...

set PORT=
for /f %%P in ('python -c "import socket; exec('for p in range(8000, 8100):\n try:\n  s=socket.socket()\n  s.bind((\'127.0.0.1\', p))\n  s.close()\n  print(p)\n  break\n except OSError:\n  pass')"') do (
    set PORT=%%P
)

if "!PORT!"=="" set PORT=8000

if "!PORT!"=="8000" (
    echo [OK] Port 8000 is available.
) else (
    echo [NOTICE] Port 8000 is currently in use by another application.
    echo [OK] Automatically selected available port: !PORT!
)

echo Starting local high-speed engine...
echo Opening browser at http://127.0.0.1:!PORT!
echo.

start "" "http://127.0.0.1:!PORT!"
python -m uvicorn server:app --host 127.0.0.1 --port !PORT!

pause

