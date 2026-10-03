"""Master the rendered mix to social-media loudness and remux it with the untouched video.

Two-pass EBU R128 loudnorm (linear) to -14 LUFS integrated, -1.5 dBTP true peak.
Usage: python tools/master.py [in.mp4] [out.mp4]   (defaults: out/render.mp4 -> out/flashquizz-promo.mp4)
"""
import json
import re
import sys
from pathlib import Path

from ffmpeg import ROOT, ffmpeg

TARGET = "I=-14:TP=-1.5:LRA=11"


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "render.mp4"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "out" / "flashquizz-promo.mp4"
    probe = ROOT / "out" / "_loudnorm.wav"

    report = ffmpeg("-i", str(src), "-vn", "-af", f"loudnorm={TARGET}:print_format=json", "-acodec", "pcm_s16le", str(probe))
    probe.unlink(missing_ok=True)
    m = json.loads(re.findall(r"\{[^{}]*\}", report)[-1])
    print(f"measured {m['input_i']} LUFS, {m['input_tp']} dBTP, LRA {m['input_lra']}")

    second = (f"loudnorm={TARGET}:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
              f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}"
              ":print_format=json")
    report = ffmpeg("-i", str(src), "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", second,
                    "-ar", "48000", "-c:a", "aac", "-b:a", "256k", "-t", "30", "-movflags", "+faststart", str(dst))
    out = json.loads(re.findall(r"\{[^{}]*\}", report)[-1])
    print(f"mastered {out['output_i']} LUFS, {out['output_tp']} dBTP ({out["normalization_type"]}) -> {dst.name}")


if __name__ == "__main__":
    main()
