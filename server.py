"""
FastAPI Server for Video-to-Audio Converter.
High-speed, asynchronous processing with batch conversion, in-browser preview, and batch ZIP export.
"""

import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import List, Optional
import subprocess

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from converter import (
    FFMPEG_BIN,
    FFPROBE_BIN,
    convert_video_to_audio,
    format_bytes,
    format_seconds,
    get_media_info,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMP_DIR = BASE_DIR / "temp_uploads"
OUTPUT_DIR = BASE_DIR / "output_audio"

TEMP_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="SonicStrip - Video to Audio Converter",
    description="Ultrafast, lightweight video-to-audio extraction and transcoding engine",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/system-info")
def get_system_info():
    """Returns engine capabilities, formats, and paths."""
    return {
        "status": "ready",
        "ffmpeg_bin": FFMPEG_BIN,
        "ffprobe_bin": FFPROBE_BIN,
        "output_directory": str(OUTPUT_DIR),
        "supported_formats": [
            {"id": "mp3", "name": "MP3 (MPEG-3)", "desc": "Universal compatibility, high quality"},
            {"id": "wav", "name": "WAV (Uncompressed PCM)", "desc": "Studio quality, lossless audio"},
            {"id": "m4a", "name": "M4A (AAC Audio)", "desc": "Apple & mobile friendly, crystal clear"},
            {"id": "aac", "name": "AAC (Advanced Audio)", "desc": "High efficiency standard"},
            {"id": "flac", "name": "FLAC (Free Lossless)", "desc": "Pure audiophile bit-perfect"},
            {"id": "ogg", "name": "OGG (Vorbis)", "desc": "Open source, high fidelity"},
            {"id": "opus", "name": "OPUS", "desc": "Ultra low latency, next-gen codec"}
        ],
        "bitrates": ["320k", "256k", "192k", "128k", "96k"]
    }


@app.post("/api/convert")
async def convert_single_video(
    file: UploadFile = File(...),
    format: str = Form("mp3"),
    bitrate: str = Form("320k"),
    stream_copy: bool = Form(False),
    start_time: Optional[float] = Form(None),
    end_time: Optional[float] = Form(None),
):
    """
    Receives video file upload, runs fast audio extraction / transcoding,
    and returns playback and download metadata.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    file_id = str(uuid.uuid4())[:8]
    sanitized_name = Path(file.filename).name
    temp_video_path = TEMP_DIR / f"{file_id}_{sanitized_name}"

    try:
        # Stream save video file to disk
        with open(temp_video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Probe video
        media_info = get_media_info(str(temp_video_path))

        # Convert
        output_file_path, meta = convert_video_to_audio(
            input_path=str(temp_video_path),
            output_dir=str(OUTPUT_DIR),
            target_format=format,
            bitrate=bitrate,
            stream_copy=stream_copy,
            start_time=start_time,
            end_time=end_time,
        )

        output_filename = os.path.basename(output_file_path)

        result = {
            "success": True,
            "id": file_id,
            "original_filename": file.filename,
            "output_filename": output_filename,
            "stream_url": f"/api/audio/{output_filename}",
            "download_url": f"/api/download/{output_filename}",
            "meta": meta,
            "media_info": media_info,
        }
        return JSONResponse(content=result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup uploaded video to save space
        if temp_video_path.exists():
            try:
                os.remove(temp_video_path)
            except Exception:
                pass


@app.post("/api/batch-convert")
async def convert_batch_videos(
    files: List[UploadFile] = File(...),
    format: str = Form("mp3"),
    bitrate: str = Form("320k"),
    stream_copy: bool = Form(False),
):
    """
    Processes multiple video files sequentially or concurrently,
    and prepares a batch zip archive for instant download.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    batch_id = str(uuid.uuid4())[:8]
    converted_files = []
    errors = []

    for file in files:
        if not file.filename:
            continue
        file_id = str(uuid.uuid4())[:6]
        sanitized_name = Path(file.filename).name
        temp_video_path = TEMP_DIR / f"{file_id}_{sanitized_name}"

        try:
            with open(temp_video_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            media_info = get_media_info(str(temp_video_path))

            output_file_path, meta = convert_video_to_audio(
                input_path=str(temp_video_path),
                output_dir=str(OUTPUT_DIR),
                target_format=format,
                bitrate=bitrate,
                stream_copy=stream_copy,
            )

            output_filename = os.path.basename(output_file_path)
            converted_files.append({
                "id": file_id,
                "original_filename": file.filename,
                "output_filename": output_filename,
                "file_path": output_file_path,
                "stream_url": f"/api/audio/{output_filename}",
                "download_url": f"/api/download/{output_filename}",
                "meta": meta,
                "media_info": media_info,
            })
        except Exception as e:
            errors.append({"file": file.filename, "error": str(e)})
        finally:
            if temp_video_path.exists():
                try:
                    os.remove(temp_video_path)
                except Exception:
                    pass

    # Create ZIP archive if multiple files converted
    zip_filename = None
    zip_download_url = None
    if len(converted_files) > 1:
        zip_filename = f"audio_batch_{batch_id}.zip"
        zip_path = OUTPUT_DIR / zip_filename
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for item in converted_files:
                f_path = item["file_path"]
                if os.path.exists(f_path):
                    zipf.write(f_path, arcname=item["output_filename"])
        zip_download_url = f"/api/download/{zip_filename}"

    return {
        "success": True,
        "batch_id": batch_id,
        "total_requested": len(files),
        "total_converted": len(converted_files),
        "items": converted_files,
        "errors": errors,
        "zip_download_url": zip_download_url,
        "zip_filename": zip_filename,
    }


@app.get("/api/audio/{filename}")
def stream_audio(filename: str):
    """Streams audio file with support for byte range seeking."""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    ext = file_path.suffix.lower()
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".opus": "audio/opus",
    }
    content_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(file_path, media_type=content_type)


@app.get("/api/download/{filename}")
def download_audio(filename: str):
    """Triggers direct browser file download."""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=filename,
    )


@app.post("/api/open-folder")
def open_output_folder():
    """Opens the local output folder in Windows File Explorer."""
    try:
        os.startfile(str(OUTPUT_DIR))
        return {"success": True, "message": f"Opened {OUTPUT_DIR}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/clear-history")
def clear_history():
    """Deletes temporary and output audio files."""
    deleted_count = 0
    for folder in [TEMP_DIR, OUTPUT_DIR]:
        for item in folder.glob("*"):
            if item.is_file():
                try:
                    item.unlink()
                    deleted_count += 1
                except Exception:
                    pass
    return {"success": True, "deleted_count": deleted_count}


# Serve static web frontend
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "SonicStrip API is running. Static frontend not yet compiled."}


if __name__ == "__main__":
    import uvicorn
    import webbrowser
    import threading

    def open_browser():
        time.sleep(1.2)
        webbrowser.open("http://127.0.0.1:8000")

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
