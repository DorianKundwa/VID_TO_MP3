# ⚡ SonicStrip — Lightning-Fast Video to Audio Converter

An ultra-lightweight, blazing-fast, and beautiful desktop-class web app to extract and transcode audio from video files. Powered by local **FFmpeg** and **FastAPI** with 100% offline privacy and zero quality loss.

![Preview](static/icon.svg)

---

## ✨ Features

- **⚡ Ultra-Fast "Stream Copy"**: Extract native audio tracks directly in ~0.2 seconds with 0% re-encoding delay and 100% lossless fidelity.
- **🎚️ Multi-Format Transcoding**: Convert to **MP3** (up to 320 kbps), **WAV** (lossless PCM), **AAC**, **M4A**, **FLAC**, **OGG (Vorbis)**, and **OPUS**.
- **📦 Multi-File Batch Conversion**: Drop dozens of videos at once; process and download individually or packaged in a single **ZIP** archive.
- **🎵 In-Browser Waveform Player**: Listen to your converted tracks instantly inside the browser with a live interactive canvas waveform scrubber before downloading.
- **✂️ Precision Segment Trimming**: Optional start and end time trimming to extract only the clip or sound you need.
- **🔒 100% Offline & Private**: Runs entirely on your local machine (`127.0.0.1:8000`). No files ever leave your computer.
- **🖥️ Dual Mode**: Sleek modern Web GUI + fast Command-Line Interface (`cli.py`).

---

## 🚀 Quick Start (Web App)

### 1. Launch with One Click
Double-click `run.bat` on Windows. It will automatically check for an open port (defaulting to 8000, or finding 8001+ if 8000 is in use), start the engine, and launch your browser automatically:
```
http://127.0.0.1:8000 (or http://127.0.0.1:8001 if 8000 is busy)
```

### 2. Manual Terminal Launch
```bash
python server.py
# or custom port:
python server.py --port 8080
# or direct uvicorn:
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

---

## 💻 Command-Line Interface (CLI)

Prefer the terminal? SonicStrip includes an ultra-fast CLI:

```bash
# Basic conversion to 320 kbps MP3
python cli.py video.mp4

# Ultra-fast lossless stream copy (under 0.5s)
python cli.py video.mp4 -c

# Convert to WAV with custom output folder
python cli.py video.mp4 -f wav -o ./my_audio

# Batch convert all MP4 files in a folder
python cli.py "C:\Videos\*.mp4" -f mp3 -b 320k

# Trim first 30 seconds
python cli.py video.mp4 --start 0 --end 30
```

---

## 📁 Project Structure

```
VID_TO_MP3/
├── server.py           # FastAPI backend server with REST endpoints & streaming
├── converter.py        # Core FFmpeg wrapper (probing, stream-copy, transcoding)
├── cli.py              # Command-line utility for quick terminal batch conversion
├── run.bat             # One-click Windows desktop launcher
├── requirements.txt    # Lightweight Python dependencies
├── static/
│   ├── index.html      # Responsive modern web UI
│   ├── css/style.css   # Dark glassmorphism styling & animations
│   └── js/app.js       # Waveform canvas, drag-and-drop & audio controller
├── temp_uploads/       # Temporary upload buffers (auto-cleaned)
└── output_audio/       # Converted audio outputs
```

---

## ⚙️ Requirements
- Python 3.9+
- FFmpeg (Installed on system PATH or standard directories)
- `fastapi`, `uvicorn`, `python-multipart` (already installed in your environment)
