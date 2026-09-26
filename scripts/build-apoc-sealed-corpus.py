#!/usr/bin/env python3
"""Build apocrypha + sealed scroll JSON corpora under public/corpus/."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APOC_DIR = ROOT / "public" / "corpus" / "apocrypha"
SEALED_DIR = ROOT / "public" / "corpus" / "sealed"
NATASRYM_SRC = ROOT / "public" / "corpus" / "book-of-natasrym.json"

KJV1611_BASE = "https://raw.githubusercontent.com/aruljohn/Bible-kjv-1611/main"
SCROLL_BASE = (
    "https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/sources/en"
)

# Must match APOC_BOOKS[].n / SEALED_BOOKS[].n in public/index.html
APOC_FORGE_NAMES = [
    "Wisdom of Solomon",
    "Sirach (Ecclesiasticus)",
    "Tobit",
    "Judith",
    "1 Maccabees",
    "2 Maccabees",
    "Baruch",
    "Letter of Jeremiah",
    "2 Esdras (4 Ezra)",
    "1 Esdras",
    "Additions to Esther",
    "Prayer of Azariah",
    "Susanna",
    "Bel and the Dragon",
    "Prayer of Manasseh",
    "Psalm 151",
    "3 Maccabees",
    "4 Maccabees",
    "2 Baruch",
    "Testament of Solomon",
    "Apocalypse of Elijah",
    "Ascension of Isaiah",
    "Testament of the Twelve Patriarchs",
    "Sefer Yetzirah (Book of Formation)",
    "1 Enoch (Ethiopian Enoch)",
    "2 Enoch (Slavonic Secrets of Enoch)",
    "3 Enoch (Hebrew Book of Enoch)",
    "Book of Jasher (Sefer HaYashar)",
    "Book of Jubilees (Little Genesis)",
    "Testament of Abraham",
    "Testament of Moses (Assumption)",
    "Testament of Job",
    "Testament of Adam",
    "Apocalypse of Abraham",
    "1 Adam and Eve (Vita Adae)",
    "2 Adam and Eve",
    "Book of Giants",
    "Sefer Raziel HaMalakh",
    "Shepherd of Hermas",
    "Didache (Teaching of the Twelve)",
    "Gospel of Nicodemus (Acts of Pilate)",
    "Psalms of Solomon",
    "Odes of Solomon",
    "3 Baruch (Greek Apocalypse)",
    "4 Baruch (Rest of Jeremiah)",
    "Apocalypse of Zephaniah",
    "Ladder of Jacob",
    "Treatise of Shem",
    "Lives of the Prophets",
    "Martyrdom of Isaiah",
    "Apocalypse of Peter",
    "History of the Rechabites",
    "Sefer HaBahir (Book of Brightness)",
    "Pistis Sophia",
    "Conflict of Adam and Eve with Satan",
    "Book of Natasrym (Natsarim)",
]

SEALED_FORGE_NAMES = [
    "Sefer Yetzirah (Book of Formation)",
    "1 Enoch (Ethiopian Enoch)",
    "2 Enoch (Slavonic Secrets of Enoch)",
    "3 Enoch (Hebrew Book of Enoch)",
    "Book of Jasher (Sefer HaYashar)",
    "Book of Jubilees (Little Genesis)",
    "Testament of Abraham",
    "Testament of Moses (Assumption)",
    "Testament of Job",
    "Testament of Adam",
    "Testament of Solomon",
    "Apocalypse of Abraham",
    "1 Adam and Eve (Vita Adae)",
    "2 Adam and Eve",
    "Book of Giants",
    "Sefer Raziel HaMalakh",
    "Shepherd of Hermas",
    "Didache (Teaching of the Twelve)",
    "Gospel of Nicodemus (Acts of Pilate)",
    "Psalms of Solomon",
    "Odes of Solomon",
    "3 Baruch (Greek Apocalypse)",
    "4 Baruch (Rest of Jeremiah)",
    "Apocalypse of Zephaniah",
    "Apocalypse of Elijah",
    "Ladder of Jacob",
    "Treatise of Shem",
    "Lives of the Prophets",
    "Martyrdom of Isaiah",
    "Apocalypse of Peter",
    "History of the Rechabites",
    "Sefer HaBahir (Book of Brightness)",
    "Pistis Sophia",
    "Conflict of Adam and Eve with Satan",
    "Book of Natasrym (Natsarim)",
]

KJV1611_FILE: dict[str, str] = {
    "Wisdom of Solomon": "Wisdom of Solomon.json",
    "Sirach (Ecclesiasticus)": "Ecclesiasticus.json",
    "Tobit": "Tobit.json",
    "Judith": "Judith.json",
    "1 Maccabees": "1 Maccabees.json",
    "2 Maccabees": "2 Maccabees.json",
    "Baruch": "Baruch.json",
    "Letter of Jeremiah": "Letter of Jeremiah.json",
    "2 Esdras (4 Ezra)": "2 Esdras.json",
    "1 Esdras": "1 Esdras.json",
    "Prayer of Azariah": "Prayer of Azariah.json",
    "Susanna": "Susanna.json",
    "Bel and the Dragon": "Bel and the Dragon.json",
    "Prayer of Manasseh": "Prayer of Manasseh.json",
}

SCROLL_SINGLE: dict[str, str] = {
    "Additions to Esther": "greek-esther/greek-esther.json",
    "Psalm 151": "five-psalms-of-david/five-psalms-of-david.json",
    "2 Baruch": "2-baruch/2-baruch.json",
    "Testament of Solomon": "testament-of-solomon/testament-of-solomon.json",
    "Apocalypse of Elijah": "apocalypse-of-elijah/apocalypse-of-elijah.json",
    "Ascension of Isaiah": "ascension-of-isaiah/ascension-of-isaiah.json",
    "1 Enoch (Ethiopian Enoch)": "1-enoch/1-enoch.json",
    "2 Enoch (Slavonic Secrets of Enoch)": "2-enoch/2-enoch.json",
    "Book of Jasher (Sefer HaYashar)": "book-of-jasher/book-of-jasher.json",
    "Book of Jubilees (Little Genesis)": "book-of-jubilees/book-of-jubilees.json",
    "Testament of Abraham": "testament-of-abraham/testament-of-abraham.json",
    "Testament of Moses (Assumption)": "assumption-of-moses/assumption-of-moses.json",
    "Testament of Job": "testament-of-job/testament-of-job.json",
    "Apocalypse of Abraham": "apocalypse-of-abraham/apocalypse-of-abraham.json",
    "1 Adam and Eve (Vita Adae)": "1-adam-and-eve/1-adam-and-eve.json",
    "2 Adam and Eve": "2-adam-and-eve/2-adam-and-eve.json",
    "Book of Giants": "book-of-giants/book-of-giants.json",
    "Gospel of Nicodemus (Acts of Pilate)": "gospel-of-nicodemus/gospel-of-nicodemus.json",
    "Psalms of Solomon": "psalms-of-solomon/psalms-of-solomon.json",
    "Odes of Solomon": "odes-of-solomon/odes-of-solomon.json",
    "3 Baruch (Greek Apocalypse)": "3-baruch/3-baruch.json",
    "4 Baruch (Rest of Jeremiah)": "4-baruch/4-baruch.json",
    "Ladder of Jacob": "ladder-of-jacob/ladder-of-jacob.json",
    "Lives of the Prophets": "lives-of-the-prophets/lives-of-the-prophets.json",
    "Apocalypse of Peter": "apocalypse-of-peter/apocalypse-of-peter.json",
    "History of the Rechabites": "history-of-the-rechabites/history-of-the-rechabites.json",
    "Wisdom of Solomon": "wisdom-of-solomon/wisdom-of-solomon.json",
    "Sirach (Ecclesiasticus)": "book-of-sirach/book-of-sirach.json",
    "Tobit": "book-of-tobit/book-of-tobit.json",
    "Judith": "book-of-judith/book-of-judith.json",
    "1 Maccabees": "1-maccabees/1-maccabees.json",
    "2 Maccabees": "2-maccabees/2-maccabees.json",
    "Baruch": "1-baruch/1-baruch.json",
    "2 Esdras (4 Ezra)": "2-esdras/2-esdras.json",
    "1 Esdras": "1-esdras/1-esdras.json",
    "Prayer of Azariah": "azar/azar.json",
    "Susanna": "susanna/susanna.json",
    "Bel and the Dragon": "bel-and-the-dragon/bel-and-the-dragon.json",
    "Prayer of Manasseh": "prayer-of-manasseh/prayer-of-manasseh.json",
}

T12P_SLUGS = [
    "testament-of-reuben",
    "testament-of-simeon",
    "testament-of-levi",
    "testament-of-judah",
    "testament-of-issachar",
    "testament-of-zebulun",
    "testament-of-dan",
    "testament-of-gad",
    "testament-of-asher",
    "testament-of-naphtali",
    "testament-of-joseph",
    "testament-of-benjamin",
]

HERMAS_SLUGS = ["1-hermas", "2-hermas", "3-hermas"]

ALIASES: dict[str, list[str]] = {
    "Sirach (Ecclesiasticus)": ["Ecclesiasticus", "Sirach"],
    "2 Esdras (4 Ezra)": ["2 Esdras", "4 Ezra"],
    "1 Enoch (Ethiopian Enoch)": ["1 Enoch", "Enoch"],
    "Book of Natasrym (Natsarim)": ["Natasrym", "Natsarim", "Book of Natsarim", "Gospel of the Kailedy"],
    "Testament of Moses (Assumption)": ["Assumption of Moses", "Testament of Moses"],
}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "yah-forge-direct-corpus-build/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
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


def kjv1611_to_forge(forge_name: str, raw: dict) -> dict:
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
        "aliases": ALIASES.get(forge_name, []),
        "translation": "KJV (1611)",
        "source": "King James Version 1611 via aruljohn/Bible-kjv-1611",
        "chapters": chapters,
    }


def renumber_chapters_sequential(chapters: dict[str, str]) -> dict[str, str]:
    if not chapters:
        return chapters
    keys = sorted(chapters.keys(), key=lambda k: int(k))
    return {str(i + 1): chapters[k] for i, k in enumerate(keys)}


def scrollmapper_to_forge(
    forge_name: str, data: dict, source_note: str, *, renumber: bool = False
) -> dict:
    book = data["books"][0]
    chapters: dict[str, str] = {}
    for ch in book.get("chapters") or []:
        ch_num = str(ch.get("chapter", "")).strip()
        if not ch_num:
            continue
        body = chapter_to_lines(ch)
        if body:
            chapters[ch_num] = body
    if renumber:
        chapters = renumber_chapters_sequential(chapters)
    return {
        "book": forge_name,
        "aliases": ALIASES.get(forge_name, []),
        "translation": "English (public-domain apocrypha corpus)",
        "source": source_note,
        "chapters": chapters,
    }


def load_scrollmapper(path: str) -> dict:
    return fetch_json(f"{SCROLL_BASE}/{path}")


def merge_scroll_chapters_sequential(slugs: list[str], source_note: str) -> dict[str, str]:
    out: dict[str, str] = {}
    n = 1
    for slug in slugs:
        data = load_scrollmapper(f"{slug}/{slug}.json")
        book = data["books"][0]
        for ch in sorted(book.get("chapters") or [], key=lambda c: int(c["chapter"])):
            body = chapter_to_lines(ch)
            if body:
                out[str(n)] = body
                n += 1
    return out


def merge_twelve_patriarchs() -> dict[str, str]:
    out: dict[str, str] = {}
    for idx, slug in enumerate(T12P_SLUGS, start=1):
        data = load_scrollmapper(f"{slug}/{slug}.json")
        book = data["books"][0]
        lines: list[str] = []
        vnum = 1
        for ch in sorted(book.get("chapters") or [], key=lambda c: int(c["chapter"])):
            for v in ch.get("verses") or []:
                text = re.sub(r"\s+", " ", str(v.get("text", "")).strip())
                if text:
                    lines.append(f"{vnum}. {text}")
                    vnum += 1
        if lines:
            out[str(idx)] = "\n".join(lines)
    return out


def psalm_151_chapters() -> dict[str, str]:
    data = load_scrollmapper("five-psalms-of-david/five-psalms-of-david.json")
    book = data["books"][0]
    # Last section is Psalm 151 in this collection; fall back to whole book as one chapter.
    chapters = sorted(book.get("chapters") or [], key=lambda c: int(c["chapter"]))
    target = chapters[-1] if chapters else None
    if not target:
        return {}
    body = chapter_to_lines(target)
    return {"1": body} if body else {}


def forge_filename(name: str) -> str:
    return name.replace("/", "-") + ".json"


def build_book(forge_name: str) -> dict | None:
    if forge_name == "Book of Natasrym (Natsarim)":
        if not NATASRYM_SRC.is_file():
            print(f"  skip {forge_name}: missing {NATASRYM_SRC}")
            return None
        return json.loads(NATASRYM_SRC.read_text(encoding="utf-8"))

    if forge_name == "Testament of the Twelve Patriarchs":
        chapters = merge_twelve_patriarchs()
        if not chapters:
            return None
        return {
            "book": forge_name,
            "aliases": ["Testaments of the Twelve Patriarchs"],
            "translation": "English (public-domain apocrypha corpus)",
            "source": "scrollmapper/bible_databases_deuterocanonical (12 testament texts)",
            "chapters": chapters,
        }

    if forge_name == "Shepherd of Hermas":
        chapters = merge_scroll_chapters_sequential(
            HERMAS_SLUGS,
            "scrollmapper/bible_databases_deuterocanonical (1–3 Hermas)",
        )
        if not chapters:
            return None
        return {
            "book": forge_name,
            "aliases": ["Hermas", "Pastor of Hermas"],
            "translation": "English (public-domain apocrypha corpus)",
            "source": "scrollmapper/bible_databases_deuterocanonical (1–3 Hermas)",
            "chapters": chapters,
        }

    if forge_name == "Psalm 151":
        chapters = psalm_151_chapters()
        if not chapters:
            return None
        return {
            "book": forge_name,
            "aliases": ["Psalm CLI"],
            "translation": "English (public-domain apocrypha corpus)",
            "source": "scrollmapper/bible_databases_deuterocanonical (Five Psalms of David)",
            "chapters": chapters,
        }

    if forge_name in KJV1611_FILE:
        url = f"{KJV1611_BASE}/{urllib.parse.quote(KJV1611_FILE[forge_name])}"
        try:
            raw = fetch_json(url)
        except urllib.error.HTTPError as exc:
            print(f"  KJV1611 HTTP {exc.code} for {forge_name}")
            raw = None
        if raw:
            payload = kjv1611_to_forge(forge_name, raw)
            if payload["chapters"]:
                return payload

    if forge_name in SCROLL_SINGLE:
        try:
            data = load_scrollmapper(SCROLL_SINGLE[forge_name])
        except urllib.error.HTTPError as exc:
            print(f"  scrollmapper HTTP {exc.code} for {forge_name}")
            return None
        payload = scrollmapper_to_forge(
            forge_name,
            data,
            "scrollmapper/bible_databases_deuterocanonical",
            renumber=forge_name == "Additions to Esther",
        )
        return payload if payload["chapters"] else None

    print(f"  no source mapped for {forge_name}")
    return None


def write_corpus(out_dir: Path, forge_names: list[str], label: str) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_books: list[dict] = []
    total_chapters = 0
    built = 0

    for name in forge_names:
        print(f"[{label}] {name}...")
        try:
            payload = build_book(name)
        except Exception as exc:  # noqa: BLE001 — build script aggregates per-book failures
            print(f"  FAILED {name}: {exc}")
            continue
        if not payload or not payload.get("chapters"):
            continue
        out_path = out_dir / forge_filename(name)
        out_path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        ch_count = len(payload["chapters"])
        total_chapters += ch_count
        built += 1
        manifest_books.append(
            {"book": name, "file": forge_filename(name), "chapters": ch_count}
        )
        print(f"  -> {ch_count} chapters")

    manifest = {
        "collection": label,
        "books": manifest_books,
        "totalBooks": len(manifest_books),
        "totalChapters": total_chapters,
        "source": "scripts/build-apoc-sealed-corpus.py",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"{label}: {built} books, {total_chapters} chapters -> {out_dir}")
    return built


def main() -> int:
    apoc_built = write_corpus(APOC_DIR, APOC_FORGE_NAMES, "apocrypha")
    sealed_built = write_corpus(SEALED_DIR, SEALED_FORGE_NAMES, "sealed")
    if apoc_built == 0 and sealed_built == 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
