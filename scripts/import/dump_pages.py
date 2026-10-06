"""Dump scanned reviewer PDFs to page images for transcription.

Usage:  py -3.12 scripts/import/dump_pages.py [source ...]
Writes: data/pages/<source>/p###.jpg (and data/pages/jfif/*.jpg)

Pages that are a single embedded JPEG are written losslessly; low-resolution
scans are re-rendered at a higher zoom so small text stays legible.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
REVIEWER = ROOT / "reviewer"
PAGES = ROOT / "data" / "pages"

SOURCES = {
    "m3fc": {"file": "M3 Final Coaching.pdf", "zoom": 2.0},
    "m1fpb": {"file": "M1-FPB.pdf", "zoom": None},
    "m3fpb": {"file": "Module 3 FPB.pdf", "zoom": None},
    "m4fpr": {"file": "MODULE 4FPR.pdf", "zoom": None},
    "m4drill": {"file": "MODULE 4- Drill 1.pdf", "zoom": None},
    "m5notes": {"file": "Module 5.pdf", "zoom": 4.0},
    "calc": {"file": "4-Annotated Pharmaceutical Calculations Handout.pdf", "zoom": 1.5},
    # reviewer/gdrive
    "m2fpb": {"file": "gdrive/M2-FPB.pdf", "zoom": None},
    "m6fpb": {"file": "gdrive/final preboards-M6 rationale.pdf", "zoom": None},
    "m4modular": {"file": "gdrive/6-M4 Modular Exam Rationale Presentation.pdf", "zoom": 1.5},
    "rheum": {"file": "gdrive/13. INTRODUCTION TO RHEUMATOLOGIC DRUGS.pdf", "zoom": None},
    "m1handout": {"file": "gdrive/MODULE 1 - PHARMACEUTICAL CHEMISTRY.pdf", "zoom": 1.5},
    # Final Coaching papers (scans, several image tiles per page: always render)
    "m1fc": {"file": "gdrive/FC-M1.pdf", "zoom": 2.0},
    "m4fc": {"file": "gdrive/FC-M4.pdf", "zoom": 2.0},
    "m5fc": {"file": "gdrive/FC M5.pdf", "zoom": 2.0},
    # Final Pre-board question papers (used for M5 and to fill slides missing from the decks)
    "fpbq-m1": {"file": "gdrive/Final Pre-boards M1.pdf", "zoom": 2.5},
    "fpbq-m2": {"file": "gdrive/Final preboards- M2.pdf", "zoom": 2.5},
    "fpbq-m3": {"file": "gdrive/Final preboards-M3.pdf", "zoom": 2.5},
    "fpbq-m4": {"file": "gdrive/Final preboards -M4.pdf", "zoom": 2.5},
    "fpbq-m5": {"file": "gdrive/Final preboards-M5.pdf", "zoom": 2.5},
    "fpbq-m6": {"file": "gdrive/Final preboards-M6.pdf", "zoom": 2.5},
    # reviewer/manor: page images for text sources whose layout loses a few items
    "m6drill": {"file": "manor/Drills 2026/M6 - MANOR Drills Rationale.pdf", "zoom": 1.5},
    "fpbapr": {"file": "manor/Manor Compilation/FPB (April 2026).pdf", "zoom": 1.5},
    # Better-marked copies of papers already imported, used to fill in answer keys
    "m1fc-manor": {"file": "manor/Final Coaching 2026/M1 FC.pdf", "zoom": 2.0},
    "m4fc-manor": {"file": "manor/Final Coaching 2026/M4 FC.pdf", "zoom": 2.0},
    "m5fc-manor": {"file": "manor/Final Coaching 2026/M5 FC.pdf", "zoom": 1.0},
    "m5fpb-manor": {"file": "manor/Final PB 2026/M5 FPB.pdf", "zoom": 2.0},
    # November 2024 Drills (scanned, the key highlighted), one file per module
    "drill24-m1": {"file": "manor/Manor Compilation/Manor Prac Questionnaires (M1 - Maam D).pdf", "zoom": 0.65},
    "drill24-m2": {"file": "manor/Manor Compilation/Manor Prac Questionnaires (M2 - Maam D).pdf", "zoom": 0.65},
    "drill24-m3": {"file": "manor/Manor Compilation/Manor Prac Questionnaires (M3 - Maam D).pdf", "zoom": 0.65},
    "drill24-m4": {"file": "manor/Manor Compilation/Manor Prac Questionnaires (M4 - Maam D).pdf", "zoom": 0.65},
    "drill24-m5": {"file": "manor/Manor Compilation/Manor Prac Questionnaires (M5 - Maam D).pdf", "zoom": 0.65},
    "drill24-m6": {"file": "manor/Manor Compilation/Manor Prac Questionnaires (M6 - Maam D).pdf", "zoom": 0.65},
}


def dump(source: str, cfg: dict) -> None:
    out = PAGES / source
    out.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(REVIEWER / cfg["file"])
    for pno in range(doc.page_count):
        page = doc[pno]
        target = out / f"p{pno + 1:03d}.jpg"
        imgs = page.get_images(full=True)
        if cfg["zoom"] is None and len(imgs) == 1:
            info = doc.extract_image(imgs[0][0])
            if info["ext"] in ("jpeg", "jpg"):
                target.write_bytes(info["image"])
                continue
        zoom = cfg["zoom"] or 1.5
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
        pix.save(target, jpg_quality=88)
    print(f"{source}: {doc.page_count} pages -> {out}")


def copy_jfif() -> None:
    out = PAGES / "jfif"
    out.mkdir(parents=True, exist_ok=True)
    for f in sorted(REVIEWER.glob("*.jfif")):
        shutil.copyfile(f, out / (f.stem + ".jpg"))
    print(f"jfif: {len(list(out.iterdir()))} images -> {out}")


def main(argv: list[str]) -> None:
    for source in argv or list(SOURCES):
        if source == "jfif":
            copy_jfif()
        else:
            dump(source, SOURCES[source])
    if not argv:
        copy_jfif()


if __name__ == "__main__":
    main(sys.argv[1:])
