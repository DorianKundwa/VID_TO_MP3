@echo off
title SonicStrip - Video to Audio Converter
echo ===================================================
echo   ⚡ SonicStrip Video-to-Audio Studio
echo ===================================================
echo Starting local high-speed engine...
echo Opening browser at http://127.0.0.1:8000
echo.

start "" "http://127.0.0.1:8000"
python -m uvicorn server:app --host 127.0.0.1 --port 8000
pause
