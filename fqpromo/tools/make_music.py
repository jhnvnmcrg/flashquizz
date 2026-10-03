"""Synthesise an original 128 BPM pop/house bed for the promo (royalty-free by construction).

Bars are counted from music.origin in src/data/timeline.json, so the drop lands exactly on
the word "celebrate". Arrangement by bar index:
  0      filtered intro chords            (hook: "Board exam season?")
  1..    groove: kick, clap, hats, bass, pluck stabs
  DROP-2 groove with the filter opening, 16th hats
  DROP-1 build: riser, snare roll, kick drops out
  DROP.. drop: crash, sub boom, arpeggio lead (celebrate + end card)
  then   final chord stab ringing out, faded at 30 s
Writes public/audio/music.wav (44.1 kHz, 16-bit stereo).
"""
import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 44100
TOTAL = 30.0
N = int(SR * TOTAL)
rng = np.random.default_rng(7)

tl = json.loads((ROOT / "src" / "data" / "timeline.json").read_text(encoding="utf-8"))["music"]
BAR = tl["barSeconds"]
BEAT = BAR / 4
ORIGIN = tl["origin"]
DROP_BAR = tl["dropBar"]

# D – A – Bm – G (I–V–vi–IV in D major)
CHORDS = [[62, 66, 69, 74], [61, 64, 69, 73], [62, 66, 71, 74], [62, 67, 71, 74]]
BASS = [38, 33, 35, 31]
LEAD = [[74, 78, 81, 78, 74, 78, 81, 86], [73, 76, 81, 76, 73, 76, 81, 85],
        [74, 78, 83, 78, 74, 78, 83, 86], [74, 79, 83, 79, 74, 79, 83, 86]]

L = np.zeros(N)
R = np.zeros(N)
duck = np.ones(N)  # sidechain gain, written by the kick


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bar_time(b, beat=0.0):
    return ORIGIN + b * BAR + beat * BEAT


def add(sig, t0, pan=0.0, gain=1.0, ducked=True):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if i0 < 0:
        sig, i0 = sig[-i0:], 0
    sig = sig[: N - i0] * gain
    if ducked:
        sig = sig * duck[i0:i0 + len(sig)]
    L[i0:i0 + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i0:i0 + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def fft_filter(x, lo=0.0, hi=SR / 2):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(spec, len(x))


def pluck(m, dur=0.32, bright=1.0, detune=0.0):
    t = tt(dur)
    f = hz(m) * 2 ** (detune / 1200)
    out = np.zeros_like(t)
    for k in range(1, 13):
        if f * k > 12000:
            break
        out += np.sin(2 * np.pi * f * k * t) / k ** 1.15 * np.exp(-t * (7 + (3.2 / bright) * k))
    return out * np.minimum(1, t / 0.003)


def pad(m, dur, bright=0.5):
    t = tt(dur)
    out = np.zeros_like(t)
    for d in (-7, 7):
        f = hz(m) * 2 ** (d / 1200)
        for k in range(1, 7):
            out += np.sin(2 * np.pi * f * k * t + k) / k ** (2.2 - bright)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3)
    return out * env


def bass(m, dur):
    t = tt(dur)
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.004) * np.exp(-t * 3.5) * np.minimum(1, (dur - t) / 0.01)
    return np.tanh(1.6 * x * env)


def kick(t0, gain=1.0):
    t = tt(0.4)
    freq = 48 + 120 * np.exp(-t * 32)
    x = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 7.5)
    x[:60] += rng.normal(0, 0.4, 60) * np.linspace(1, 0, 60)
    add(x, t0, gain=gain, ducked=False)
    i0 = int(round(t0 * SR))
    td = tt(0.32)
    g = 1 - 0.6 * np.exp(-td / 0.075)
    if 0 <= i0 < N:
        seg = slice(i0, min(N, i0 + len(g)))
        duck[seg] = np.minimum(duck[seg], g[: seg.stop - seg.start])


def noise_hit(dur, lo, hi, decay, gain=1.0):
    t = tt(dur)
    return fft_filter(rng.normal(0, 1, len(t)), lo, hi) * np.exp(-t * decay) * gain


def clap(t0, gain=1.0):
    x = np.zeros(int(0.25 * SR))
    for off in (0, 0.011, 0.022):
        n = noise_hit(0.2, 900, 3200, 28)
        i = int(off * SR)
        x[i:i + len(n)] += n[: len(x) - i]
    add(x, t0, gain=0.55 * gain, ducked=False)


def hat(t0, gain=1.0, pan=0.0):
    add(noise_hit(0.06, 7000, 16000, 70), t0, pan=pan, gain=0.22 * gain, ducked=False)


def crash(t0, gain=1.0):
    add(noise_hit(2.2, 3500, 16000, 1.9), t0, pan=-0.2, gain=0.35 * gain, ducked=False)
    add(noise_hit(2.2, 3500, 16000, 2.1), t0, pan=0.2, gain=0.35 * gain, ducked=False)


def snare(t0, gain=1.0):
    t = tt(0.18)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    add(noise_hit(0.18, 1200, 9000, 22) * 0.8 + body * 0.5, t0, gain=0.4 * gain, ducked=False)


first_bar = int(np.floor((0 - ORIGIN) / BAR))
last_bar = int(np.ceil((TOTAL - ORIGIN) / BAR))

for b in range(first_bar, last_bar + 1):
    ci = b % 4
    chord, root = CHORDS[ci], BASS[ci]
    t0 = bar_time(b)
    if b >= DROP_BAR + 2:  # final stab, rings out into the fade
        for j, m in enumerate(chord):
            add(pluck(m, 1.6, 1.4), t0, pan=(j - 1.5) * 0.3, gain=0.3, ducked=False)
            add(pad(m, 1.2, 0.8), t0, gain=0.05, ducked=False)
        kick(t0)
        crash(t0, 0.8)
        add(np.sin(2 * np.pi * 45 * tt(1.2)) * np.exp(-tt(1.2) * 2.5), t0, gain=0.6, ducked=False)
        continue

    intro = b < 1
    build = b == DROP_BAR - 1
    drop = b >= DROP_BAR
    bright = 0.35 if intro else (0.7 + 0.6 * ((b - DROP_BAR + 3) / 2) if b in (DROP_BAR - 3, DROP_BAR - 2) else (1.4 if drop else 0.9))

    # chord stabs on the off-beats; sustained pad in the intro and the build
    if intro or build:
        for m in chord:
            add(pad(m, BAR, 0.4 if intro else 0.9), t0, gain=0.07, ducked=not intro)
    for e in range(8):
        if intro and e % 2 == 0:
            continue
        if e % 2 == 1 or drop:
            for j, m in enumerate(chord[:3]):
                det = 6 if j % 2 else -6
                add(pluck(m, 0.3, bright, det), t0 + e * BEAT / 2, pan=(j - 1) * 0.45, gain=0.18)

    if intro:
        continue

    # drums
    for beat in range(4):
        if not build:
            kick(bar_time(b, beat))
        if beat in (1, 3) and not build:
            clap(bar_time(b, beat))
    sub = 4 if (drop or b == DROP_BAR - 2) else 2
    for s in range(4 * sub):
        pos = s / sub
        if sub == 2 and s % 2 == 0:
            continue
        hat(bar_time(b, pos), 0.8 if s % 2 else 0.5, pan=0.25 if s % 2 else -0.25)

    # bass on the 8ths, pumping against the kick
    if not build:
        for e in range(8):
            add(bass(root + (12 if e % 4 == 3 else 0), BEAT / 2 * 0.92), t0 + e * BEAT / 2, gain=0.32)

    if build:
        # snare roll 8ths → 16ths → 32nds, rising noise + sweep
        for q, div in ((0, 2), (1, 2), (2, 4), (3, 8)):
            for k in range(div):
                snare(bar_time(b, q + k / div), 0.35 + 0.65 * (q + k / div) / 4)
        t = tt(BAR)
        sweep = np.sin(2 * np.pi * np.cumsum(220 + 1300 * (t / BAR) ** 2) / SR) * (t / BAR) ** 2
        nz = fft_filter(rng.normal(0, 1, len(t)), 2500, 14000) * (t / BAR) ** 2.4
        add(sweep * 0.12 + nz * 0.22, t0, ducked=False)
        for e in range(8):
            add(bass(root, BEAT / 2 * 0.9), t0 + e * BEAT / 2, gain=0.18 * (e / 8), ducked=False)

    if drop:
        if b == DROP_BAR:
            crash(t0, 1.0)
            boom = np.sin(2 * np.pi * np.cumsum(38 + 40 * np.exp(-tt(1.4) * 6)) / SR) * np.exp(-tt(1.4) * 2.2)
            add(boom, t0, gain=0.7, ducked=False)
        for e, m in enumerate(LEAD[ci]):
            t = tt(BEAT / 2 * 0.95)
            f = hz(m)
            sq = sum(np.sin(2 * np.pi * f * k * t) / k for k in (1, 3, 5, 7)) * np.exp(-t * 6)
            add(sq * np.minimum(1, t / 0.004), t0 + e * BEAT / 2, pan=0.15 * (1 if e % 2 else -1), gain=0.09)

# master: soft clip, fade out at the very end, normalise to -3 dBFS
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.2)
fade = np.ones(N)
k = int(0.45 * SR)
fade[-k:] = np.linspace(1, 0, k) ** 1.5
mix *= fade[:, None]
mix *= 10 ** (-3 / 20) / np.max(np.abs(mix))

out = ROOT / "public" / "audio" / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"wrote {out} — bars {first_bar}..{last_bar}, drop at {tl['drop']:.2f}s")
