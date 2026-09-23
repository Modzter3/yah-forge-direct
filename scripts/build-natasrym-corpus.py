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


def verses_to_lines(body: str) -> str:
    body = re.sub(r"\n(?!\d+\s)", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    verses: list[str] = []
    for match in re.finditer(
        r'(\d+)\s+((?:[^"]|"[^"]*")*?)(?=\s\d+\s+[A-Za-z"\(]|$)', body
    ):
        num, text = match.group(1), match.group(2).strip()
        text = re.sub(r"\s+", " ", text)
        verses.append(f"{num}. {text}")
    return "\n".join(verses)


def main() -> None:
    print(f"Downloading {PDF_URL} ...")
    pdf_bytes = urllib.request.urlopen(PDF_URL, timeout=120).read()
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


if __name__ == "__main__":
    main()
    sys.exit(0)
