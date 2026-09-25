#!/usr/bin/env python3
"""Download KJV (66 books) and write Forge chapter JSON under public/corpus/kjv/."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/aruljohn/Bible-kjv/master"
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "corpus" / "kjv"
MANIFEST = OUT_DIR / "manifest.json"

# Must match BIBLE_BOOKS[].n in public/index.html
# aruljohn repo filenames (no spaces for numbered books / Song of Solomon)
REMOTE_FILE: dict[str, str] = {
    "1 Samuel": "1Samuel.json",
    "2 Samuel": "2Samuel.json",
    "1 Kings": "1Kings.json",
    "2 Kings": "2Kings.json",
    "1 Chronicles": "1Chronicles.json",
    "2 Chronicles": "2Chronicles.json",
    "1 Corinthians": "1Corinthians.json",
    "2 Corinthians": "2Corinthians.json",
    "1 Thessalonians": "1Thessalonians.json",
    "2 Thessalonians": "2Thessalonians.json",
    "1 Timothy": "1Timothy.json",
    "2 Timothy": "2Timothy.json",
    "1 Peter": "1Peter.json",
    "2 Peter": "2Peter.json",
    "1 John": "1John.json",
    "2 John": "2John.json",
    "3 John": "3John.json",
    "Song of Solomon": "SongofSolomon.json",
}

FORGE_BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalms",
    "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
    "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John",
    "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
    "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
    "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
    "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John",
    "3 John", "Jude", "Revelation",
]


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "yah-forge-direct-corpus-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def chapter_to_lines(chapter_obj: dict) -> str:
    lines: list[str] = []
    for v in chapter_obj.get("verses") or []:
        num = str(v.get("verse", "")).strip()
        text = str(v.get("text", "")).strip()
        text = re.sub(r"\s+", " ", text)
        if not num or not text:
            continue
        lines.append(f"{num}. {text}")
    return "\n".join(lines)


def convert_book(raw: dict, forge_name: str) -> dict:
    chapters: dict[str, str] = {}
    for ch in raw.get("chapters") or []:
        ch_num = str(ch.get("chapter", "")).strip()
        if not ch_num:
            continue
        body = chapter_to_lines(ch)
        if body:
            chapters[ch_num] = body
    return {
        "book": forge_name,
        "aliases": [],
        "translation": "KJV",
        "source": "King James Version via aruljohn/Bible-kjv (MIT)",
        "chapters": chapters,
    }


def forge_book_filename(name: str) -> str:
    return name.replace("/", "-") + ".json"


def remote_book_url(name: str) -> str:
    remote = REMOTE_FILE.get(name, name.replace(" ", "") + ".json")
    return f"{BASE}/{remote}"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_books: list[dict] = []
    total_chapters = 0

    for name in FORGE_BOOKS:
        url = remote_book_url(name)
        print(f"Fetching {name}...")
        try:
            raw = fetch_json(url)
        except urllib.error.HTTPError as exc:
            print(f"  FAILED HTTP {exc.code} for {url}", file=__import__("sys").stderr)
            return 1
        payload = convert_book(raw, name)
        if raw.get("book") and raw.get("book") != name:
            payload["aliases"] = [raw["book"]]
        out_path = OUT_DIR / forge_book_filename(name)
        out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        ch_count = len(payload["chapters"])
        total_chapters += ch_count
        manifest_books.append(
            {
                "book": name,
                "file": forge_book_filename(name),
                "chapters": ch_count,
            }
        )
        print(f"  -> {ch_count} chapters")

    manifest = {
        "translation": "KJV",
        "books": manifest_books,
        "totalBooks": len(manifest_books),
        "totalChapters": total_chapters,
        "source": "https://github.com/aruljohn/Bible-kjv",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Done: {len(manifest_books)} books, {total_chapters} chapters -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
