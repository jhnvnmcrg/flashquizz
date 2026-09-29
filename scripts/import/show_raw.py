"""Print raw question blocks for review / structuring.

Usage:  py -3.12 scripts/import/show_raw.py <source> [--module m4] [--from 1] [--to 25]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("--module")
    parser.add_argument("--from", dest="start", type=int, default=1)
    parser.add_argument("--to", dest="end", type=int, default=10_000)
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    path = ROOT / "data" / "raw" / f"{args.source}.jsonl"
    for line in path.open(encoding="utf-8"):
        b = json.loads(line)
        if args.module and b["module"] != args.module:
            continue
        if not (args.start <= b["ordinal"] <= args.end):
            continue
        print(f"════ {b['sourceRef']}  (printed {b['printedNo']}, page {b['page']}, module {b['module']})")
        print("── QUESTION COLUMN")
        print(b["question"])
        print(f"── ANSWER RAW: {b['answerRaw']}")
        print("── RATIONALE COLUMN")
        print(b["rationale"] or "(empty)")
        if b["images"]:
            print("── IMAGES (data/images/…)")
            for img in b["images"]:
                print(f"   {img['file']}  column={img['column']}  {img['width']}x{img['height']}pt")
        print()


if __name__ == "__main__":
    main()
