"""
Core Video to Audio Converter module using FFmpeg.
Provides ultrafast extraction, stream-copy, and high-quality transcoding.
"""

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Callable, Dict, Optional, Tuple


def find_binary(binary_name: str) -> str:
    """Finds binary path or falls back to standard Windows paths."""
    found = shutil.which(binary_name)
    if found:
        return found
    fallback_paths = [
        rf"C:\Program Files\FFmpeg\bin\{binary_name}.exe",
        rf"C:\ffmpeg\bin\{binary_name}.exe",
        rf"C:\ProgramData\chocolatey\bin\{binary_name}.exe",
    ]
    for p in fallback_paths:
        if os.path.exists(p):
            return p
    return binary_name


FFMPEG_BIN = find_binary("ffmpeg")
FFPROBE_BIN = find_binary("ffprobe")


def get_media_info(file_path: str) -> Dict:
    """Probes video file to inspect duration, audio streams, codecs, and channels."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    cmd = [
        FFPROBE_BIN,
        "-v", "error",
        "-show_entries", "format=duration,size,bit_rate:stream=index,codec_name,codec_type,channels,sample_rate,bit_rate",
        "-of", "json",
        file_path
    ]

    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(result.stdout)
        
        format_info = data.get("format", {})
        streams = data.get("streams", [])
        
        duration = float(format_info.get("duration", 0.0))
        file_size = int(format_info.get("size", os.path.getsize(file_path)))
        
        audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
        has_audio = len(audio_streams) > 0
        primary_audio = audio_streams[0] if has_audio else {}

        return {
            "duration": duration,
            "duration_formatted": format_seconds(duration),
            "file_size": file_size,
            "file_size_formatted": format_bytes(file_size),
            "has_audio": has_audio,
            "audio_codec": primary_audio.get("codec_name", "none"),
            "audio_channels": primary_audio.get("channels", 2),
            "sample_rate": primary_audio.get("sample_rate", "44100"),
            "bit_rate": primary_audio.get("bit_rate") or format_info.get("bit_rate")
        }
    except Exception as e:
        # Fallback basic info
        file_size = os.path.getsize(file_path)
        return {
            "duration": 0.0,
            "duration_formatted": "00:00",
            "file_size": file_size,
            "file_size_formatted": format_bytes(file_size),
            "has_audio": True,
            "audio_codec": "unknown",
            "audio_channels": 2,
            "sample_rate": "44100",
            "bit_rate": None,
            "error": str(e)
        }


def format_seconds(seconds: float) -> str:
    """Formats float seconds into HH:MM:SS or MM:SS."""
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def format_bytes(bytes_count: int) -> str:
    """Formats raw bytes to human readable string."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_count < 1024.0:
            return f"{bytes_count:.1f} {unit}"
        bytes_count /= 1024.0
    return f"{bytes_count:.1f} TB"


def determine_stream_copy_extension(audio_codec: str) -> str:
    """Maps codec name to appropriate container extension for direct stream copy."""
    codec_map = {
        "aac": "m4a",
        "mp3": "mp3",
        "opus": "opus",
        "vorbis": "ogg",
        "flac": "flac",
        "pcm_s16le": "wav",
        "pcm_s24le": "wav",
        "ac3": "ac3",
        "eac3": "eac3",
        "alac": "m4a"
    }
    return codec_map.get(audio_codec.lower(), "m4a")


def convert_video_to_audio(
    input_path: str,
    output_dir: str,
    target_format: str = "mp3",
    bitrate: str = "320k",
    stream_copy: bool = False,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None
) -> Tuple[str, Dict]:
    """
    Converts video file to audio.
    Returns: (output_file_path, conversion_metadata)
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    os.makedirs(output_dir, exist_ok=True)
    input_info = get_media_info(input_path)
    total_duration = input_info.get("duration", 0.0)

    input_filename = Path(input_path).stem

    # Determine format and codec
    target_format = target_format.lower().strip()
    if stream_copy:
        audio_codec = input_info.get("audio_codec", "aac")
        ext = determine_stream_copy_extension(audio_codec)
        output_format = ext
        is_direct_copy = True
    else:
        output_format = target_format
        is_direct_copy = False

    output_filename = f"{input_filename}.{output_format}"
    output_path = os.path.join(output_dir, output_filename)

    # Avoid name collisions
    counter = 1
    while os.path.exists(output_path):
        output_filename = f"{input_filename}_{counter}.{output_format}"
        output_path = os.path.join(output_dir, output_filename)
        counter += 1

    cmd = [FFMPEG_BIN, "-y", "-nostdin"]

    # Trim options
    if start_time is not None and start_time > 0:
        cmd.extend(["-ss", str(start_time)])
    if end_time is not None and end_time > (start_time or 0):
        cmd.extend(["-to", str(end_time)])

    cmd.extend(["-i", input_path, "-vn"])

    # Codec and bitrate configurations
    if is_direct_copy:
        cmd.extend(["-c:a", "copy"])
    else:
        if output_format == "mp3":
            cmd.extend(["-c:a", "libmp3lame", "-b:a", bitrate])
        elif output_format == "wav":
            cmd.extend(["-c:a", "pcm_s16le"])
        elif output_format == "aac":
            cmd.extend(["-c:a", "aac", "-b:a", bitrate if bitrate else "256k"])
        elif output_format == "m4a":
            cmd.extend(["-c:a", "aac", "-b:a", bitrate if bitrate else "256k"])
        elif output_format == "flac":
            cmd.extend(["-c:a", "flac"])
        elif output_format == "ogg":
            cmd.extend(["-c:a", "libvorbis", "-q:a", "6"])
        elif output_format == "opus":
            cmd.extend(["-c:a", "libopus", "-b:a", bitrate if bitrate else "160k"])
        else:
            # Fallback to mp3
            output_format = "mp3"
            cmd.extend(["-c:a", "libmp3lame", "-b:a", bitrate])

    # Performance flags
    cmd.extend(["-threads", "0", "-progress", "pipe:1", output_path])

    start_perf_time = time.time()

    # Calculate expected duration for progress estimation
    effective_duration = total_duration
    if start_time or end_time:
        st = start_time or 0.0
        et = end_time if end_time and end_time > st else total_duration
        effective_duration = max(et - st, 0.1)

    # Execute process
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
        bufsize=1
    )

    out_time_re = re.compile(r"out_time_ms=(\d+)")

    if process.stdout:
        for line in process.stdout:
            match = out_time_re.search(line)
            if match and effective_duration > 0:
                out_time_us = int(match.group(1))
                current_sec = out_time_us / 1000000.0
                progress_pct = min(round((current_sec / effective_duration) * 100, 1), 99.0)
                if progress_callback:
                    progress_callback(progress_pct, f"Extracting audio ({progress_pct}%)...")

    stdout, stderr = process.communicate()
    exit_code = process.returncode

    if exit_code != 0:
        raise RuntimeError(f"FFmpeg conversion failed (code {exit_code}): {stderr}")

    elapsed_time = round(time.time() - start_perf_time, 2)
    output_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

    if progress_callback:
        progress_callback(100.0, "Conversion complete!")

    input_size = input_info.get("file_size", 1)
    compression_ratio = round(((input_size - output_size) / input_size) * 100, 1) if input_size > 0 else 0

    return output_path, {
        "output_filename": output_filename,
        "format": output_format,
        "is_stream_copy": is_direct_copy,
        "bitrate": bitrate if not is_direct_copy else "Original (Lossless)",
        "elapsed_seconds": elapsed_time,
        "output_size": output_size,
        "output_size_formatted": format_bytes(output_size),
        "input_size": input_size,
        "input_size_formatted": format_bytes(input_size),
        "size_reduction_pct": max(compression_ratio, 0.0),
        "duration": effective_duration,
        "duration_formatted": format_seconds(effective_duration)
    }
