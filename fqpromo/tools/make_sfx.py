"""Synthesise the UI and celebration sound effects into public/audio/sfx/*.wav."""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio" / "sfx"
SR = 44100
rng = np.random.default_rng(3)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def bandpass(x, lo, hi):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(spec, len(x))


def write(name, x, peak_db=-3.0):
    x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def tone(freq, dur, decay, harm=(1.0,)):
    t = tt(dur)
    x = sum(a * np.sin(2 * np.pi * freq * (k + 1) * t) for k, a in enumerate(harm))
    return x * np.exp(-t * decay) * np.minimum(1, t / 0.002)


def tap():
    t = tt(0.07)
    f = 1500 * np.exp(-t * 18) + 600
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 70)
    x[:80] += rng.normal(0, 0.5, 80) * np.linspace(1, 0, 80)
    return x


def ding():
    a = tone(1318.5, 0.9, 5, (1, 0.25, 0.08))
    b = tone(1975.5, 0.9, 5, (1, 0.2))
    x = np.zeros(int(1.0 * SR))
    x[: len(a)] += a
    i = int(0.08 * SR)
    x[i:i + len(b)] += b[: len(x) - i]
    return x


def whoosh(dur=0.45, f0=500, f1=3500):
    n = int(dur * SR)
    noise = rng.normal(0, 1, n + 2048)
    out = np.zeros(n + 2048)
    hop, win = 256, np.hanning(1024)
    for s in range(0, n, hop):
        c = f0 + (f1 - f0) * (s / n)
        seg = bandpass(noise[s:s + 1024] * win, c * 0.6, c * 1.6)
        out[s:s + 1024] += seg * win
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return out[:n] * env


def blip(freqs, step=0.075):
    x = np.zeros(int(step * SR * len(freqs) + 0.25 * SR))
    for i, f in enumerate(freqs):
        s = tone(f, 0.22, 16, (1, 0.0, 0.25))
        j = int(i * step * SR)
        x[j:j + len(s)] += s
    return x


def pop():
    t = tt(0.06)
    f = 520 + 700 * (t / 0.06)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 55)


def sparkle():
    x = np.zeros(int(0.9 * SR))
    for i, f in enumerate((2093, 2637, 3136, 4186)):
        s = tone(f, 0.7, 7, (1, 0.15))
        j = int(i * 0.045 * SR)
        x[j:j + len(s)] += s[: len(x) - j] * (0.9 - i * 0.12)
    return x


def boom():
    t = tt(1.6)
    thump = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t * 14)) / SR) * np.exp(-t * 5)
    burst = bandpass(rng.normal(0, 1, len(t)), 80, 2500) * np.exp(-t * 9)
    crackle = np.zeros(len(t))
    for _ in range(140):
        c = rng.uniform(0.12, 1.5) ** 1.3
        j = int(c * SR)
        if j + 200 < len(t):
            crackle[j:j + 200] += rng.normal(0, 1, 200) * np.exp(-np.arange(200) / 25) * np.exp(-c * 2.2)
    crackle = bandpass(crackle, 2500, 12000)
    return thump * 1.0 + burst * 0.5 + crackle * 0.9


OUT.mkdir(parents=True, exist_ok=True)
write("tap", tap(), -6)
write("ding", ding(), -4)
write("whoosh", whoosh(), -5)
write("swoosh-up", whoosh(0.35, 300, 2000), -8)
write("offline", blip([880, 587]), -6)
write("online", blip([587, 880, 1175]), -6)
write("pop", pop(), -9)
write("sparkle", sparkle(), -6)
write("boom", boom(), -2)
print("wrote", sorted(p.name for p in OUT.glob("*.wav")))
