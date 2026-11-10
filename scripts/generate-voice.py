"""Regenerate the included Vietnamese voice clips using Edge TTS.

Requires: python -m pip install edge-tts
Run from anywhere: python scripts/generate-voice.py
Existing valid clips are kept. Each request is bounded and retried at most twice.
"""

import asyncio
import json
import pathlib
import sys
import unicodedata

import edge_tts


ROOT = pathlib.Path(__file__).resolve().parents[1]
VOICE = "vi-VN-NamMinhNeural"


def mp3_duration_ms(filename):
    """Validate complete MPEG Layer III frames and return decoded duration."""
    data = filename.read_bytes()
    offset = 0
    if data[:3] == b"ID3" and len(data) >= 10:
        offset = 10 + sum((data[6 + i] & 0x7F) << (21 - 7 * i) for i in range(4))
    duration = 0.0
    frames = 0
    while offset + 4 <= len(data):
        if len(data) - offset == 128 and data[offset:offset + 3] == b"TAG":
            offset = len(data)
            break
        header = int.from_bytes(data[offset:offset + 4], "big")
        version = (header >> 19) & 3
        layer = (header >> 17) & 3
        bitrate_index = (header >> 12) & 15
        sample_index = (header >> 10) & 3
        padding = (header >> 9) & 1
        if header >> 21 != 0x7FF or version == 1 or layer != 1 or bitrate_index in (0, 15) or sample_index == 3:
            raise ValueError(f"Invalid MPEG frame at byte {offset}: {filename.name}")
        rates = [44100, 48000, 32000]
        sample_rate = rates[sample_index] // (1 if version == 3 else 2 if version == 2 else 4)
        bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] if version == 3 else [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
        bitrate = bitrates[bitrate_index] * 1000
        size = (144 if version == 3 else 72) * bitrate // sample_rate + padding
        if offset + size > len(data):
            raise ValueError(f"Truncated MPEG frame: {filename.name}")
        duration += (1152 if version == 3 else 576) / sample_rate
        frames += 1
        offset += size
    if offset != len(data) or frames < 10:
        raise ValueError(f"Incomplete MP3: {filename.name}")
    return round(duration * 1000)


async def generate_one(entry, semaphore):
    destination = ROOT / "public" / entry["src"].lstrip("/")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 2048:
        try:
            entry["durationMs"] = mp3_duration_ms(destination)
            print(f"KEEP {destination.name}", flush=True)
            return True
        except ValueError:
            print(f"REPLACE invalid {destination.name}", flush=True)
    temporary = destination.with_suffix(".partial.mp3")
    async with semaphore:
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(
                    unicodedata.normalize("NFC", entry["text"]), VOICE, rate="-10%", pitch="-12Hz"
                )
                await asyncio.wait_for(communicate.save(str(temporary)), timeout=40)
                if temporary.stat().st_size < 2048:
                    raise RuntimeError("Provider returned empty or incomplete audio")
                entry["durationMs"] = mp3_duration_ms(temporary)
                temporary.replace(destination)
                print(f"OK {destination.name} {destination.stat().st_size} bytes", flush=True)
                return True
            except Exception as error:
                temporary.unlink(missing_ok=True)
                print(f"RETRY {destination.name} {attempt + 1}: {type(error).__name__}: {error}", flush=True)
                if attempt < 2:
                    await asyncio.sleep(2 ** (attempt + 1))
        return False


async def main():
    manifest = json.loads((ROOT / "voice-lines.json").read_text(encoding="utf-8"))
    entries = [entry for group in manifest.values() for entry in group]
    semaphore = asyncio.Semaphore(2)
    results = await asyncio.gather(*(generate_one(entry, semaphore) for entry in entries))
    for entry in entries:
        entry["text"] = unicodedata.normalize("NFC", entry["text"])
    (ROOT / "voice-lines.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated/retained {sum(results)}/{len(results)} clips", flush=True)
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
