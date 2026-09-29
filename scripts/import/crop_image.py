"""Crop a region of a page image into data/images/ (for figures on scanned pages).

Usage:
  py -3.12 scripts/import/crop_image.py <page.jpg> <x0> <y0> <x1> <y1> <out-name.png>

Coordinates are fractions of the page (0–1), top-left origin, e.g.
  py -3.12 scripts/import/crop_image.py data/pages/m1fpb/p014.jpg 0.1 0.35 0.6 0.8 m1fpb/m1fpb_014-1.png
The output path is relative to data/images/.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]


def main(argv: list[str]) -> None:
    if len(argv) != 6:
        print(__doc__)
        sys.exit(2)
    src, x0, y0, x1, y1, out = argv
    doc = pymupdf.open(src)  # opens the image as a one-page document
    page = doc[0]
    w, h = page.rect.width, page.rect.height
    clip = pymupdf.Rect(float(x0) * w, float(y0) * h, float(x1) * w, float(y1) * h)
    pix = page.get_pixmap(clip=clip, matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
    target = ROOT / "data" / "images" / out
    target.parent.mkdir(parents=True, exist_ok=True)
    pix.save(target)
    print(f"wrote data/images/{out} ({pix.width}x{pix.height})")


if __name__ == "__main__":
    main(sys.argv[1:])
