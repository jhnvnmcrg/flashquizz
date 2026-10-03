"""Shared helpers: Remotion's bundled ffmpeg (no system install needed) and WAV I/O."""
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = ROOT / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"


def ffmpeg(*args: str) -> str:
    """Run ffmpeg; returns stderr (where ffmpeg prints its reports)."""
    res = subprocess.run([str(FFMPEG), "-hide_banner", "-y", *args], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr[-2000:])
    return res.stderr


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels()) / 32768
        return x, w.getframerate()


def write_wav(path: Path, x: np.ndarray, sr: int) -> None:
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
