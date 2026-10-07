"""
SonicStrip CLI - Lightweight & Fast Command-line Video to Audio Extractor.
Usage:
    python cli.py my_video.mp4
    python cli.py my_video.mp4 -f wav
    python cli.py my_video.mp4 -c (Ultra-fast direct stream copy)
    python cli.py *.mp4 -f mp3 -b 320k
"""

import argparse
import glob
import os
import sys
from pathlib import Path

# Safe Windows stdout encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from converter import convert_video_to_audio, get_media_info


def main():
    parser = argparse.ArgumentParser(
        description="SonicStrip: Lightning-fast video to audio converter powered by FFmpeg.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("inputs", nargs="+", help="Input video file(s) or pattern (e.g. video.mp4, *.mkv)")
    parser.add_argument("-f", "--format", default="mp3", choices=["mp3", "wav", "aac", "m4a", "flac", "ogg", "opus"], help="Target audio format")
    parser.add_argument("-b", "--bitrate", default="320k", help="Audio bitrate (e.g. 320k, 256k, 192k, 128k)")
    parser.add_argument("-c", "--copy", action="store_true", help="Ultra-fast Stream Copy (lossless, no re-encoding)")
    parser.add_argument("-o", "--output", default="./output_audio", help="Output directory")
    parser.add_argument("--start", type=float, default=None, help="Start trim time in seconds")
    parser.add_argument("--end", type=float, default=None, help="End trim time in seconds")

    args = parser.parse_args()

    files = []
    for pattern in args.inputs:
        matched = glob.glob(pattern)
        if matched:
            files.extend(matched)
        elif os.path.exists(pattern):
            files.append(pattern)

    if not files:
        print("[!] No matching files found.")
        sys.exit(1)

    out_dir = os.path.abspath(args.output)
    os.makedirs(out_dir, exist_ok=True)

    print("\n" + "=" * 60)
    print("  [*] SONICSTRIP VIDEO-TO-AUDIO EXTRACTOR")
    print("=" * 60)
    print(f"  Target Format : {args.format.upper() if not args.copy else 'STREAM COPY (ORIGINAL CODEC)'}")
    if not args.copy:
        print(f"  Target Bitrate: {args.bitrate}")
    print(f"  Output Folder : {out_dir}")
    print(f"  Files to Process: {len(files)}")
    print("-" * 60)

    for idx, filepath in enumerate(files, 1):
        filename = os.path.basename(filepath)
        print(f"\n[{idx}/{len(files)}] Processing: {filename} ...")
        try:
            out_file, meta = convert_video_to_audio(
                input_path=filepath,
                output_dir=out_dir,
                target_format=args.format,
                bitrate=args.bitrate,
                stream_copy=args.copy,
                start_time=args.start,
                end_time=args.end,
                progress_callback=lambda pct, msg: print(f"\r  [*] {msg}", end="", flush=True)
            )
            print(f"\r  [+] Done in {meta['elapsed_seconds']}s! Output: {meta['output_filename']}")
            print(f"      Size: {meta['input_size_formatted']} -> {meta['output_size_formatted']} (-{meta['size_reduction_pct']}%)")
        except Exception as e:
            print(f"\n  [!] Failed: {e}")

    print("\n" + "=" * 60)
    print(f"  [+] All operations finished! Check folder: {out_dir}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
