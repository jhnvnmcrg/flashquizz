"""Generate one voiceover clip per caption chunk with edge-tts.

Each clip is high-passed, compressed and peak-normalised so the voice sits clearly on top of
the music, then written to public/audio/vo/<line>-<n>.wav. src/data/vo.json holds each clip's
duration and word timings (seconds); the timeline is laid out from it.

Usage: python tools/make_vo.py [--voice en-PH-JamesNeural] [--rate +8%]
"""
import argparse
import asyncio
import json
from pathlib import Path

import edge_tts
import numpy as np

from ffmpeg import ffmpeg, read_wav, write_wav

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "audio" / "vo"
MANIFEST = ROOT / "src" / "data" / "vo.json"
TICKS = 10_000_000  # edge-tts offsets are in 100 ns units
SR = 48000


async def synth(text: str, voice: str, rate: str, path: Path) -> list[dict]:
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words = []
    with path.open("wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / TICKS
                words.append({"text": chunk["text"], "start": round(start, 3),
                              "end": round(start + chunk["duration"] / TICKS, 3)})
    return words


def process(x: np.ndarray, sr: int) -> np.ndarray:
    """High-pass 90 Hz, 3:1 compression above -26 dBFS (20 ms RMS), normalise to -1 dBFS peak."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    spec *= 1 / np.sqrt(1 + (90 / np.maximum(f, 1)) ** 4)
    x = np.fft.irfft(spec, len(x))
    win = int(0.02 * sr)
    env = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, mode="same") + 1e-12)
    over = np.maximum(0, 20 * np.log10(env) + 26)
    gain_db = -over * (1 - 1 / 3)
    gain_db = np.convolve(gain_db, np.ones(win // 4) / (win // 4), mode="same")
    x = x * 10 ** (gain_db / 20)
    return x * 10 ** (-1 / 20) / np.max(np.abs(x))


async def main() -> None:
    script = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=script["voice"])
    ap.add_argument("--rate", default=script["rate"])
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"voice": args.voice, "rate": args.rate, "lines": []}
    for line in script["lines"]:
        chunks = []
        for i, chunk in enumerate(line["chunks"]):
            name = f"{line['id']}-{i}"
            mp3, wav = OUT_DIR / f"{name}.mp3", OUT_DIR / f"{name}.wav"
            words = await synth(chunk["tts"], args.voice, args.rate, mp3)
            ffmpeg("-i", str(mp3), "-ar", str(SR), "-ac", "1", "-acodec", "pcm_s16le", str(wav))
            mp3.unlink()
            x, sr = read_wav(wav)
            write_wav(wav, process(x[:, 0], sr), sr)
            duration = len(x) / sr
            chunks.append({"file": f"audio/vo/{name}.wav", "caption": chunk["caption"],
                           "duration": round(duration, 3), "words": words})
            spoken = f"{words[0]['start']:.2f}-{words[-1]['end']:.2f}s" if words else "no words"
            print(f"{name:14} {duration:5.2f}s  speech {spoken}  {chunk['tts']}")
        manifest["lines"].append({"id": line["id"], "chunks": chunks})

    total = sum(c["duration"] for l in manifest["lines"] for c in l["chunks"])
    print(f"total clip time {total:.2f}s")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
