#!/usr/bin/env python3
"""Build a complete 1 Enoch corpus (R.H. Charles 1917, public domain) from Wikisource.

The scrollmapper source used by build-apoc-sealed-corpus.py drops verses and merges
others (e.g. chapter 10 loses verses 7, 14, 16 and merges 21+22), which breaks the
forge's verse counter. This script keeps Charles's own verse numbering: 108 chapters,
every verse on its own "N. text" line, sub-verses (6a, 6b, 7c...) merged into the
parent verse, and parallel Greek/Latin table columns dropped in favour of the Ethiopic.

Usage:
  python3 scripts/build-enoch-corpus.py            # fetch + write
  python3 scripts/build-enoch-corpus.py --cache raw.json   # reuse a saved fetch
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS_DIRS = [ROOT / "public" / "corpus" / "sealed", ROOT / "public" / "corpus" / "apocrypha"]
BOOK = "1 Enoch (Ethiopian Enoch)"
API = "https://en.wikisource.org/w/api.php"
TITLE = "The Book of Enoch (Charles)/Chapter {:02d}"
SOURCE = "R.H. Charles 1917 (Wikisource: The Book of Enoch (Charles)) — full verse numbering"


def fetch_all() -> dict[int, str]:
    out: dict[int, str] = {}
    titles = [TITLE.format(i) for i in range(1, 109)]
    for i in range(0, len(titles), 25):
        batch = titles[i : i + 25]
        url = API + "?" + urllib.parse.urlencode(
            {
                "action": "query",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "format": "json",
                "formatversion": "2",
                "redirects": "1",
                "titles": "|".join(batch),
            }
        )
        req = urllib.request.Request(url, headers={"User-Agent": "yah-forge-corpus-builder/1.0"})
        data = json.load(urllib.request.urlopen(req, timeout=60))
        redirects = {r["from"]: r["to"] for r in data["query"].get("redirects", [])}
        pages = {p["title"]: p for p in data["query"]["pages"]}
        for t in batch:
            page = pages.get(redirects.get(t, t))
            if not page or "revisions" not in page:
                raise SystemExit(f"missing page: {t}")
            out[int(t.rsplit(" ", 1)[1])] = page["revisions"][0]["slots"]["main"]["content"]
        time.sleep(0.4)
    return out


def flatten_tables(w: str) -> str:
    def repl(m: re.Match) -> str:
        body = re.sub(r"^[^\n]*", "", m.group(1), count=1)
        has_header = bool(re.search(r"(?m)^\s*!", body))
        rows = re.split(r"\n\|-[^\n]*", body)
        chunks: list[str] = []
        for row in rows:
            lines = [ln for ln in row.split("\n") if not ln.lstrip().startswith("!") and not ln.lstrip().startswith("{|")]
            row_text = "\n".join(lines)
            row_text = re.sub(r"(?m)^\s*\|\s?", "", row_text, count=1)
            cells = [c for c in re.split(r"\|\|", row_text)]
            if has_header:
                cells = cells[:1]
            chunks.append("\n".join(c.strip() for c in cells))
        return "\n\n" + "\n\n".join(chunks) + "\n\n"

    return re.sub(r"\{\|(.*?)\n\|\}", repl, w, flags=re.S)


def clean(w: str) -> str:
    w = re.sub(r"\{\{header.*?\n\}\}", "", w, flags=re.S)
    w = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", w, flags=re.S)
    w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
    w = flatten_tables(w)
    w = re.sub(r"<[^>]+>", "", w)
    w = re.sub(r"(?m)^\s*=+.*?=+\s*$", "", w)
    w = re.sub(r"(?m)^\s*CHAPTER [IVXLC]+\.?\s*$", "", w)
    w = re.sub(r"'{2,}", "", w)
    w = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"\{\{[^}]*\}\}", "", w)
    w = html.unescape(w)
    w = re.sub(r"[⌈⌉〈〉⌊⌋†]", "", w)
    w = w.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    w = re.sub(r"[\[\]]", "", w)
    w = re.sub(r"(?m)^\s*[a-z]\.\s+", "", w)  # sub-verse letters (b. c. d.) continue the current verse
    return re.sub(r"\s+", " ", w).strip()


MARK = re.compile(r"(?:(?<=\s)|^)(\d{1,3})([a-z])?\.\s+(?=[A-Z'\"(.…])")


def split_verses(text: str) -> dict[int, str]:
    marks = []
    for m in MARK.finditer(text):
        n = int(m.group(1))
        if n < 1 or n > 120:
            continue
        marks.append((n, m.group(2) or "", m.start(), m.end()))
    parts: dict[int, list[tuple[str, int, str]]] = {}
    for idx, (n, letter, _s, e) in enumerate(marks):
        end = marks[idx + 1][2] if idx + 1 < len(marks) else len(text)
        chunk = text[e:end].strip()
        if chunk:
            parts.setdefault(n, []).append((letter, idx, chunk))
    verses: dict[int, str] = {}
    for n, items in parts.items():
        items.sort(key=lambda x: (x[0], x[1]))
        verses[n] = re.sub(r"\s+", " ", " ".join(c for _l, _i, c in items)).strip()
    return verses


def build(raw: dict[int, str]) -> dict[str, str]:
    chapters: dict[str, str] = {}
    problems: list[str] = []
    for ch in range(1, 109):
        verses = split_verses(clean(raw[ch]))
        if not verses:
            problems.append(f"chapter {ch}: no verses parsed")
            continue
        top = max(verses)
        missing = [n for n in range(1, top + 1) if n not in verses]
        if missing:
            problems.append(f"chapter {ch}: missing verse numbers {missing} (top {top})")
        chapters[str(ch)] = "\n".join(f"{n}. {verses[n]}" for n in sorted(verses))
    if problems:
        print("WARNINGS:\n  " + "\n  ".join(problems), file=sys.stderr)
    return chapters


def write(chapters: dict[str, str]) -> None:
    payload = {
        "book": BOOK,
        "aliases": ["1 Enoch", "Enoch"],
        "translation": "R.H. Charles 1917 (public domain)",
        "source": SOURCE,
        "chapters": chapters,
    }
    for corpus_dir in CORPUS_DIRS:
        out = corpus_dir / f"{BOOK}.json"
        if not corpus_dir.is_dir():
            continue
        out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        manifest_path = corpus_dir / "manifest.json"
        if manifest_path.exists():
            man = json.loads(manifest_path.read_text(encoding="utf-8"))
            for entry in man.get("books", []):
                if entry.get("book") == BOOK:
                    entry["chapters"] = len(chapters)
            man["totalChapters"] = sum(e.get("chapters", 0) for e in man.get("books", []))
            manifest_path.write_text(json.dumps(man, indent=2, ensure_ascii=False), encoding="utf-8")
        total = sum(len(re.findall(r"(?m)^\d+\.", t)) for t in chapters.values())
        print(f"Wrote {out} ({len(chapters)} chapters, {total} verses)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", help="JSON file of {chapter: wikitext} to reuse / save")
    args = ap.parse_args()
    raw: dict[int, str]
    if args.cache and Path(args.cache).exists():
        raw = {int(k): v for k, v in json.loads(Path(args.cache).read_text(encoding="utf-8")).items()}
    else:
        raw = fetch_all()
        if args.cache:
            Path(args.cache).write_text(json.dumps(raw), encoding="utf-8")
    write(build(raw))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
