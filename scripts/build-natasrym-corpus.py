#!/usr/bin/env python3
"""Build public/corpus/book-of-natasrym.json from the Parable of the Vineyard PDF."""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

PDF_URL = (
    "https://parableofthevineyard.com/wp-content/uploads/"
    "The-Books-of-the-Natsarim-2.pdf"
)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "corpus" / "book-of-natasrym.json"

# PDF footnote gloss lines (e.g. "18 James", "5 Jews") — not verse starts.
_FOOTNOTE_GLOSS = re.compile(
    r"^\d{1,2}\s+(?:"
    r"James|Jews|Judas|Messiah|Meaning|Or|Holy\s+Spirit|Nazarene|Passover"
    r")\s*$",
    re.I,
)


def extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit("Install pypdf: pip install pypdf") from exc
    import io

    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def parse_natsarim_chapters(full_text: str) -> dict[str, str]:
    start = full_text.find("CHAPTER 1 \n \n1 The birth of Yahusha")
    if start < 0:
        raise ValueError("Could not locate Book of the Natsarim body in PDF text")
    section = full_text[start:]
    section = re.sub(r"^CHAPTER 1\s*\n", "", section)
    parts = re.split(r"\nCHAPTER (\d+)\s*\n", section)
    chapters: dict[int, str] = {1: parts[0].strip()}
    i = 1
    while i < len(parts) - 1:
        num = int(parts[i])
        body = parts[i + 1].strip()
        if num == 1 and 21 in chapters:
            break
        if 1 <= num <= 21:
            chapters[num] = body
        i += 2
    if len(chapters) != 21:
        raise ValueError(f"Expected 21 chapters, got {len(chapters)}")
    return {str(n): verses_to_lines(chapters[n]) for n in range(1, 22)}


def strip_pdf_footnote_lines(body: str) -> str:
    """Remove footnote-only lines before flattening paragraph breaks."""
    kept: list[str] = []
    for line in body.split("\n"):
        s = line.strip()
        if not s:
            continue
        if re.fullmatch(r"\d{1,3}", s):
            continue
        if _FOOTNOTE_GLOSS.match(s):
            continue
        kept.append(s)
    return " ".join(kept)


def normalize_chapter_flat(body: str) -> str:
    body = strip_pdf_footnote_lines(body)
    body = re.sub(r"([A-Za-z])(\d{1,2})(?=[,\.\s\"'\);\]])", r"\1", body)
    body = re.sub(r"\s+", " ", body).strip()
    return body


def verses_to_lines(body: str) -> str:
    flat = normalize_chapter_flat(body)
    if not flat:
        return ""

    verse_starts: list[tuple[int, int, int]] = []
    expected = 1
    verse_start = re.compile(
        r"(?:^|\s)(\d{1,3})\s+(?=[A-Za-z\"'\(\[\u2018\u2019\u201c\u201d])"
    )
    for match in verse_start.finditer(flat):
        num = int(match.group(1))
        if num != expected:
            continue
        text_start = match.end()
        verse_starts.append((num, match.start(), text_start))
        expected += 1

    if not verse_starts:
        return flat

    lines: list[str] = []
    for idx, (num, _pos, text_start) in enumerate(verse_starts):
        if idx + 1 < len(verse_starts):
            text_end = verse_starts[idx + 1][1]
            chunk = flat[text_start:text_end].strip()
        else:
            chunk = flat[text_start:].strip()
        chunk = re.sub(r"\s+", " ", chunk)
        chunk = re.sub(r"\s+\d{1,3}\s*$", "", chunk)
        lines.append(f"{num}. {chunk}")
    return "\n".join(lines)


def load_pdf_bytes() -> bytes:
    cache = Path("/tmp/natsarim.pdf")
    if cache.is_file() and cache.stat().st_size > 100_000:
        print(f"Using cached PDF {cache} ...")
        return cache.read_bytes()
    print(f"Downloading {PDF_URL} ...")
    req = urllib.request.Request(
        PDF_URL,
        headers={"User-Agent": "YAH-Forge-Direct/1.0 (corpus rebuild)"},
    )
    pdf_bytes = urllib.request.urlopen(req, timeout=120).read()
    cache.write_bytes(pdf_bytes)
    return pdf_bytes


def main() -> None:
    pdf_bytes = load_pdf_bytes()
    print(f"Extracting text ({len(pdf_bytes)} bytes PDF) ...")
    full_text = extract_pdf_text(pdf_bytes)
    chapters = parse_natsarim_chapters(full_text)
    payload = {
        "book": "Book of Natasrym (Natsarim)",
        "aliases": [
            "Book of Natasrym (Natsarim)",
            "Book of the Natsarim",
            "Book of Natsarim",
            "Gospel of the Kailedy",
            "Natsarim",
            "Natasrym",
        ],
        "source": (
            "Parable of the Vineyard — The Books of the Natsarim "
            "(Gospel of the Kailedy, Book of the Natsarim only; 21 chapters)"
        ),
        "chapters": chapters,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    for ch in ("1", "8", "21"):
        text = chapters[ch]
        n = text.count("\n") + 1 if text else 0
        print(f"  chapter {ch}: {n} verses")


if __name__ == "__main__":
    main()
    sys.exit(0)
