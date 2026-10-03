"""Lay the VO chunks out on the 30 s timeline and derive scene cuts and the music grid.

Reads src/data/vo.json (from make_vo.py) and writes src/data/timeline.json, which both
the music generator and the Remotion composition read, so audio and visuals share one clock.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FPS = 30
TOTAL = 30.0
LEAD = 0.25          # silence before the first word
CHUNK_GAP = 0.30     # pause between chunks of one line
LINE_GAP = {"modules": 0.50, "practice": 0.55, "flashcards": 0.55,
            "offline": 0.55, "celebrate": 0.55, "end": 1.00}  # the last one lets the fireworks breathe
SCENE_LEAD = 0.20    # visuals cut in slightly before their line starts
BPM = 128
DROP_BAR = 14        # bar index of the drop; bar 1 (groove in) then lands just before "Meet FlashQuizz"


def main() -> None:
    vo = json.loads((ROOT / "src" / "data" / "vo.json").read_text(encoding="utf-8"))
    t = LEAD
    chunks, scenes = [], []
    for li, line in enumerate(vo["lines"]):
        if li > 0:
            t += LINE_GAP[line["id"]]
        scenes.append({"id": line["id"], "start": 0.0 if li == 0 else round(t - SCENE_LEAD, 3)})
        for ci, c in enumerate(line["chunks"]):
            if ci > 0:
                t += CHUNK_GAP
            w = c["words"]
            lead_in = w[0]["start"]          # silence baked into the clip before the first word
            words = [{"text": x["text"], "start": round(t + x["start"] - lead_in, 3),
                      "end": round(t + x["end"] - lead_in, 3)} for x in w]
            chunks.append({"line": line["id"], "index": ci, "file": c["file"], "caption": c["caption"],
                           "clipStart": round(t - lead_in, 3), "speechStart": round(t, 3),
                           "speechEnd": words[-1]["end"], "words": words})
            t = words[-1]["end"]
    if t > TOTAL - 0.5:
        raise SystemExit(f"VO runs to {t:.2f}s; shorten lines or raise the rate")

    for i, s in enumerate(scenes):
        s["end"] = scenes[i + 1]["start"] if i + 1 < len(scenes) else TOTAL

    celebrate = next(w for c in chunks if c["line"] == "celebrate" for w in c["words"]
                     if w["text"].lower().startswith("celebrate"))
    bar = 240 / BPM
    drop = celebrate["start"]
    music = {"bpm": BPM, "barSeconds": bar, "drop": drop, "dropBar": DROP_BAR,
             "origin": round(drop - DROP_BAR * bar, 4)}  # time at which bar 0 begins (may be < 0)

    out = {"fps": FPS, "durationInFrames": int(TOTAL * FPS), "chunks": chunks, "scenes": scenes, "music": music}
    (ROOT / "src" / "data" / "timeline.json").write_text(json.dumps(out, indent=2, ensure_ascii=False),
                                                       encoding="utf-8")
    for s in scenes:
        print(f"scene {s['id']:11} {s['start']:6.2f}-{s['end']:6.2f}s  frames {round(s['start']*FPS):4}-{round(s['end']*FPS):4}")
    print(f"speech ends {t:.2f}s; drop at {drop:.2f}s (frame {round(drop*FPS)}); bar 0 at {music['origin']:.3f}s")


if __name__ == "__main__":
    main()
