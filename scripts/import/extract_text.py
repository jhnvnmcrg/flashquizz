"""Segment the text-layer reviewer PDFs into raw question blocks.

Usage:  py -3.12 scripts/import/extract_text.py [source ...]
Writes: data/raw/<source>.jsonl  and  data/images/<source>/*.png|jpg

Each block keeps the question-column text and the rationale-column text
separately. Pairing follows the PDF content-stream order (question cell, then
its rationale cell), which survives page breaks far better than geometry.
Struck-out text (MuPDF char flag 1) is wrapped in ~~…~~ so the structuring pass
can keep only the correction.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
REVIEWER = ROOT / "reviewer"
OUT = Path(os.environ.get("FQ_EXTRACT_OUT", ROOT / "data"))
RAW_DIR = OUT / "raw"
IMG_DIR = OUT / "images"

SOURCES = {
    "pb1": {"file": "Pb1.pdf", "module": None, "answer": "label"},
    "m2fc": {"file": "M2 Final Coaching - Rationale.pdf", "module": "m2", "answer": "label"},
    "m6fc": {"file": "M6 Final Coaching - Rationale.pdf", "module": "m6", "answer": "label"},
    "m4pt": {"file": "MODULE-4-POST-TEST-RATIONALE.pdf", "module": "m4", "answer": "letter"},
    "m4compre": {"file": "gdrive/M4- MANOR Compre Rationale.pdf", "module": "m4", "answer": "label"},
    # reviewer/manor (October 2026 Comprehensive Exams and Drills; M4 of each was already imported)
    "m1compre": {"file": "manor/Compre 2026/M1 - MANOR Compre Rationale.pdf", "module": "m1", "answer": "label"},
    "m2compre": {"file": "manor/Compre 2026/M2 - MANOR Compre Rationale.pdf", "module": "m2", "answer": "label"},
    "m3compre": {"file": "manor/Compre 2026/M3 - MANOR Compre Rationale.pdf", "module": "m3", "answer": "label"},
    "m5compre": {"file": "manor/Compre 2026/M5 - MANOR Compre Rationale.pdf", "module": "m5", "answer": "label"},
    "m6compre": {"file": "manor/Compre 2026/M6 - MANOR Compre Rationale.pdf", "module": "m6", "answer": "label"},
    "m1drill": {"file": "manor/Drills 2026/M1 - MANOR Drills Rationale.pdf", "module": "m1", "answer": "label"},
    "m2drill": {"file": "manor/Drills 2026/M2 - MANOR Drills Rationale.pdf", "module": "m2", "answer": "label"},
    "m3drill": {"file": "manor/Drills 2026/M3 - MANOR Drills Rationale.pdf", "module": "m3", "answer": "label"},
    "m5drill": {"file": "manor/Drills 2026/M5 - MANOR Drills Rationale.pdf", "module": "m5", "answer": "label"},
    # A few M6 answers are a bare "C. …" with no "Answer:" label.
    "m6drill": {"file": "manor/Drills 2026/M6 - MANOR Drills Rationale.pdf", "module": "m6", "answer": "label", "bareAnswer": True},
    # Reference only: the printed key and rationale for the m4drill questions
    "m4drillkey": {"file": "manor/Drills 2026/M4 - MANOR Drills Rationale.pdf", "module": "m4", "answer": "label"},
    # April 2026 Final Pre-boards, all six modules in one file
    "fpbapr": {
        "file": "manor/Manor Compilation/FPB (April 2026).pdf",
        "module": None,
        "answer": "label",
        "headingMax": 60,  # "MODULE 1- PHARMACIST LICENSURE EXAMINATION"
    },
}

FLAGS = pymupdf.TEXTFLAGS_DICT | pymupdf.TEXT_COLLECT_STYLES
STRIKE = 1

QUESTION_START = re.compile(r"^\s*(\d{1,3})\s*\.(?!\d)\s*(\S.*)?$")
ANSWER_LABEL = re.compile(r"^\s*\.?\s*Answer\s*[:.]?\s*(.*)$", re.I)
ANSWER_LETTER = re.compile(r"^\s*([A-E])\s*$")
BARE_ANSWER = re.compile(r"^\s*([A-E])\.\s*\S")
MODULE_HEADING = re.compile(r"^\s*Module\s+([1-6])\b", re.I)
BOILERPLATE = re.compile(
    r"^\s*(Question|Rationale|Question\s+Rationale|Answer|MODULE 4 Pharmacology|MODULE 4 POST TEST|"
    r"M[26] (FC|Final Coaching)( - Rationale)?|x s54)\s*$",
    re.I,
)
MIN_IMAGE_PT = 28  # smaller images are emoji / bullet glyphs


@dataclass
class Line:
    page: int
    x0: float
    y0: float
    text: str


@dataclass
class ImageRef:
    page: int
    x0: float
    y0: float
    width: float
    height: float
    ext: str
    data: bytes
    digest: str = ""  # hash of the embedded bytes (for spotting repeated banners)


@dataclass
class Block:
    module: str
    ordinal: int
    printed_no: str
    page: int
    question: list[str] = field(default_factory=list)
    rationale: list[str] = field(default_factory=list)
    answer_seen: bool = False
    answer_raw: str = ""
    images: list[tuple[str, ImageRef]] = field(default_factory=list)
    # page -> top y of this block's first line on that page (row start)
    tops: dict[int, float] = field(default_factory=dict)

    def touch(self, it: Line) -> None:
        top = self.tops.get(it.page)
        if top is None or it.y0 < top:
            self.tops[it.page] = it.y0


def span_text(span: dict) -> str:
    text = span["text"]
    if span.get("char_flags", 0) & STRIKE and text.strip():
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()) :]
        return f"{lead}~~{text.strip()}~~{trail}"
    return text


def read_stream(doc: pymupdf.Document) -> list[Line | ImageRef]:
    items: list[Line | ImageRef] = []
    for pno in range(doc.page_count):
        page = doc[pno]
        height = page.rect.height
        d = page.get_text("dict", flags=FLAGS | pymupdf.TEXT_PRESERVE_IMAGES)
        for block in d["blocks"]:
            x0, y0, x1, y1 = block["bbox"]
            if block["type"] == 1:
                w, h = x1 - x0, y1 - y0
                if w >= MIN_IMAGE_PT and h >= MIN_IMAGE_PT and block.get("image"):
                    raw = block["image"]
                    ext = block.get("ext", "png")
                    data = raw
                    if ext not in ("jpeg", "jpg"):
                        # Embedded PNGs often rely on a soft mask; the raw bytes then
                        # decode as a black box. Render what is actually visible.
                        pix = page.get_pixmap(clip=pymupdf.Rect(x0, y0, x1, y1), matrix=pymupdf.Matrix(2, 2), alpha=False)
                        data, ext = pix.tobytes("png"), "png"
                    items.append(ImageRef(pno, x0, y0, w, h, ext, data, hashlib.sha1(raw).hexdigest()))
                continue
            for line in block.get("lines", []):
                text = "".join(span_text(s) for s in line["spans"])
                text = text.replace(" ", " ").rstrip()
                if not text.strip():
                    continue
                lx0, ly0 = line["bbox"][0], line["bbox"][1]
                # page furniture of the M4 post-test: header + page number
                if (ly0 < 45 or ly0 > height - 45) and re.fullmatch(r"\s*(\d{1,3}|MODULE 4 Pharmacology)\s*", text):
                    continue
                items.append(Line(pno, lx0, ly0, text))
    return items


def column_splits(items: list[Line | ImageRef], answer_mode: str) -> dict[int, list[tuple[float, float]]]:
    """Per page: (y, x0) of every answer marker. Its x0 marks the rationale column."""
    marks: dict[int, list[tuple[float, float]]] = {}
    for it in items:
        if not isinstance(it, Line):
            continue
        if (answer_mode == "label" and ANSWER_LABEL.match(it.text)) or (
            answer_mode == "letter" and ANSWER_LETTER.match(it.text) and it.x0 > 150
        ):
            marks.setdefault(it.page, []).append((it.y0, it.x0))
    return marks


def is_right(it: Line | ImageRef, marks: dict[int, list[tuple[float, float]]], fallback: float) -> bool:
    page_marks = marks.get(it.page)
    split = fallback
    if page_marks:
        _, split = min(page_marks, key=lambda m: abs(m[0] - it.y0))
    return it.x0 >= split - 12


def segment(source: str, cfg: dict) -> list[Block]:
    doc = pymupdf.open(REVIEWER / cfg["file"])
    items = read_stream(doc)
    marks = column_splits(items, cfg["answer"])
    all_x = [x for ms in marks.values() for _, x in ms]
    fallback = sorted(all_x)[len(all_x) // 2] if all_x else doc[0].rect.width / 2

    module = cfg["module"]
    blocks: list[Block] = []
    current: Block | None = None
    ordinal = 0
    images: list[ImageRef] = []

    for it in items:
        if isinstance(it, ImageRef):
            images.append(it)
            continue

        text = it.text
        heading = MODULE_HEADING.match(text)
        if (
            cfg["module"] is None
            and heading
            and not is_right(it, marks, fallback)
            and len(text.strip()) < cfg.get("headingMax", 40)
        ):
            module = f"m{heading.group(1)}"
            current = None
            ordinal = 0
            continue
        if module is None or BOILERPLATE.match(text):
            continue

        right = is_right(it, marks, fallback)
        qs = QUESTION_START.match(text)
        can_start = current is None or current.answer_seen
        if not right and qs and can_start:
            prev = blocks[-1] if blocks else None
            if (
                prev is not None
                and prev.module == module
                and prev.printed_no == qs.group(1)
                and prev.printed_no != "1"
                and prev.question
                and prev.question[0] == text.strip()
            ):
                # Row repeated across a page break: drop the truncated fragment.
                blocks.pop()
                ordinal -= 1
            ordinal += 1
            current = Block(module, ordinal, qs.group(1), it.page)
            current.question.append(text.strip())
            current.touch(it)
            blocks.append(current)
            continue
        if current is None:
            continue  # intro boilerplate before the first question
        current.touch(it)

        if right:
            if cfg["answer"] == "label":
                am = ANSWER_LABEL.match(text)
                if am and not current.answer_seen:
                    current.answer_seen = True
                    current.answer_raw = am.group(1).strip()
                elif cfg.get("bareAnswer") and not current.answer_seen and not current.rationale and BARE_ANSWER.match(text):
                    # The first line of the rationale column is the answer itself.
                    current.answer_seen = True
                    current.answer_raw = text.strip()
            else:
                am = ANSWER_LETTER.match(text)
                if am and not current.answer_seen:
                    current.answer_seen = True
                    current.answer_raw = am.group(1)
                    continue
            current.rationale.append(text.strip())
        else:
            # inline "… Answer: E. Antitubercular" in the question column (matching sets)
            inline = re.search(r"\bAnswer\s*:\s*(.+)$", text)
            if cfg["answer"] == "label" and inline and not current.answer_seen:
                current.answer_seen = True
                current.answer_raw = inline.group(1).strip()
                current.question.append(text[: inline.start()].rstrip())
                current.rationale.append("Answer: " + inline.group(1).strip())
            else:
                current.question.append(text.strip())

    place_images(blocks, images, marks, fallback)
    return blocks


def place_images(
    blocks: list[Block],
    images: list[ImageRef],
    marks: dict[int, list[tuple[float, float]]],
    fallback: float,
) -> None:
    """Assign each image to the table row it sits in (last row starting above it)."""
    counts: dict[str, int] = {}
    for img in images:
        counts[img.digest] = counts.get(img.digest, 0) + 1

    starts: list[tuple[int, float, Block]] = sorted(
        ((page, y, b) for b in blocks for page, y in b.tops.items()),
        key=lambda t: (t[0], t[1]),
    )
    for img in images:
        if counts[img.digest] >= 3:
            continue  # repeated banner / emoji / logo
        owner: Block | None = None
        for page, y, block in starts:
            if (page, y) <= (img.page, img.y0 + 4):
                owner = block
            else:
                break
        if owner is not None:
            role = "rationale" if is_right(img, marks, fallback) else "stem"
            owner.images.append((role, img))


def write(source: str, blocks: list[Block]) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    img_dir = IMG_DIR / source
    img_dir.mkdir(parents=True, exist_ok=True)
    for stale in img_dir.iterdir():
        stale.unlink()
    out = RAW_DIR / f"{source}.jsonl"
    with out.open("w", encoding="utf-8") as fh:
        for b in blocks:
            # Multi-module sources number per module, so the module is part of the id.
            multi = SOURCES[source]["module"] is None
            ref = f"{source}:{b.module}:{b.ordinal:03d}" if multi else f"{source}:{b.ordinal:03d}"
            images = []
            for n, (role, img) in enumerate(b.images, start=1):
                name = f"{ref.replace(':', '_')}-{n}.{img.ext}"
                (img_dir / name).write_bytes(img.data)
                images.append({"file": f"{source}/{name}", "column": role, "width": round(img.width), "height": round(img.height)})
            fh.write(
                json.dumps(
                    {
                        "sourceRef": ref,
                        "source": source,
                        "module": b.module,
                        "ordinal": b.ordinal,
                        "printedNo": b.printed_no,
                        "page": b.page + 1,
                        "question": "\n".join(b.question),
                        "answerRaw": b.answer_raw,
                        "rationale": "\n".join(b.rationale),
                        "images": images,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    by_module: dict[str, int] = {}
    for b in blocks:
        by_module[b.module] = by_module.get(b.module, 0) + 1
    missing = [b.ordinal for b in blocks if not b.answer_seen]
    n_img = sum(len(b.images) for b in blocks)
    print(f"{source}: {len(blocks)} blocks {by_module} | no answer: {len(missing)} {missing[:15]} | images: {n_img}")


def main(argv: list[str]) -> None:
    targets = argv or list(SOURCES)
    for source in targets:
        write(source, segment(source, SOURCES[source]))


if __name__ == "__main__":
    main(sys.argv[1:])
