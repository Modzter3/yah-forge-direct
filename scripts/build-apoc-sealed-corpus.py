#!/usr/bin/env python3
"""Build apocrypha + sealed scroll JSON corpora under public/corpus/."""
from __future__ import annotations

import html
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
SCROLL_ETC_BASE = (
    "https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/master/etc/en"
)
SCROLL_2024_RAW = (
    "https://raw.githubusercontent.com/scrollmapper/bible_databases_deuterocanonical/2024"
)
PISTIS_BASE = (
    "https://raw.githubusercontent.com/crucifly/bible-obsidian/main/08-Nag%20Hammadi/Pistis%20Sophia"
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


def fetch_text(url: str, *, timeout: int = 180) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "yah-forge-direct-corpus-build/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def wikisource_wikitext(page_title: str) -> str:
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "format": "json",
            "titles": page_title,
        }
    )
    url = f"https://en.wikisource.org/w/api.php?{params}"
    data = fetch_json(url)
    page = next(iter(data["query"]["pages"].values()))
    if page.get("missing"):
        raise ValueError(f"wikisource page missing: {page_title}")
    rev = page["revisions"][0]
    return rev.get("*") or rev.get("slots", {}).get("main", {}).get("*") or ""


_ROMAN: dict[str, int] = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
    "V": 5,
    "VI": 6,
    "VII": 7,
    "VIII": 8,
    "IX": 9,
    "X": 10,
    "XI": 11,
    "XII": 12,
    "XIII": 13,
    "XIV": 14,
    "XV": 15,
    "XVI": 16,
    "XVII": 17,
    "XVIII": 18,
    "XIX": 19,
    "XX": 20,
    "XXX": 30,
    "XL": 40,
    "L": 50,
    "LX": 60,
    "LXX": 70,
}


def roman_to_int(token: str) -> int:
    token = token.strip().upper()
    if token.isdigit():
        return int(token)
    if token in _ROMAN:
        return _ROMAN[token]
    # Fallback for longer Roman numerals used in Malan (e.g. LXIX).
    vals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    prev = 0
    for ch in reversed(token):
        v = vals.get(ch, 0)
        if v < prev:
            total -= v
        else:
            total += v
            prev = v
    return total or int(token, 10)


def parse_wikisource_inline_verses(wikitext: str) -> dict[str, str]:
    """Parse {{verse|chapter=N|verse=M}} markers with trailing plain text."""
    chapters: dict[str, list[tuple[int, str]]] = {}
    pattern = re.compile(
        r"\{\{verse\|chapter=(\d+)\|verse=(\d+)\}\}\s*",
        re.IGNORECASE,
    )
    matches = list(pattern.finditer(wikitext))
    for idx, match in enumerate(matches):
        ch, vs = match.group(1), int(match.group(2))
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(wikitext)
        text = wikitext[start:end]
        text = re.sub(r"\{\{[^}]+\}\}", " ", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\[\[[^\]|]+\|([^\]]+)\]\]", r"\1", text)
        text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            chapters.setdefault(ch, []).append((vs, text))
    out: dict[str, str] = {}
    for ch in sorted(chapters.keys(), key=int):
        lines = [f"{vs}. {txt}" for vs, txt in sorted(chapters[ch], key=lambda t: t[0])]
        out[str(int(ch))] = "\n".join(lines)
    return out


def lines_to_chapter_body(lines: list[str]) -> str:
    body: list[str] = []
    for i, line in enumerate(lines, start=1):
        line = re.sub(r"\s+", " ", line.strip())
        if line:
            body.append(f"{i}. {line}")
    return "\n".join(body)


def bucket_lines(lines: list[str], target_chapters: int) -> dict[str, str]:
    if not lines or target_chapters < 1:
        return {}
    buckets: list[list[str]] = [[] for _ in range(target_chapters)]
    for i, line in enumerate(lines):
        buckets[i % target_chapters].append(line)
    out: dict[str, str] = {}
    for i, bucket in enumerate(buckets, start=1):
        body = lines_to_chapter_body(bucket)
        if body:
            out[str(i)] = body
    return out


def sefaria_section_texts(ref: str) -> list[str]:
    url = f"https://www.sefaria.org/api/texts/{urllib.parse.quote(ref)}"
    data = fetch_json(url)
    texts: list[str] = []

    def walk(node) -> None:
        if isinstance(node, str):
            t = re.sub(r"<[^>]+>", " ", html.unescape(node))
            t = re.sub(r"\s+", " ", t).strip()
            if t:
                texts.append(t)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(data.get("text"))
    return texts


def sefaria_bucketed(ref: str, target_chapters: int, source_note: str, forge_name: str) -> dict:
    sections = sefaria_section_texts(ref)
    chapters = bucket_lines(sections, target_chapters)
    return {
        "book": forge_name,
        "aliases": ALIASES.get(forge_name, []),
        "translation": "English (Sefaria community translation)",
        "source": source_note,
        "chapters": chapters,
    }


def bible_api_book_chapters(book_label: str, chapter_count: int) -> dict[str, str]:
    chapters: dict[str, str] = {}
    for ch in range(1, chapter_count + 1):
        q = urllib.parse.quote(f"{book_label} {ch}")
        url = f"https://bible-api.com/{q}"
        data = fetch_json(url)
        verses = data.get("verses") or []
        lines: list[str] = []
        for v in verses:
            num = str(v.get("verse", "")).strip()
            text = re.sub(r"\s+", " ", str(v.get("text", "")).strip())
            if num and text:
                lines.append(f"{num}. {text}")
        if lines:
            chapters[str(ch)] = "\n".join(lines)
    return chapters


def load_scrollmapper_etc(relative_path: str) -> dict:
    return fetch_json(f"{SCROLL_ETC_BASE}/{relative_path}")


def fetch_didache_chapters() -> dict[str, str]:
    try:
        chapters = parse_wikisource_inline_verses(
            wikisource_wikitext("Didache_(Lightfoot_translation)")
        )
        if chapters:
            return chapters
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as exc:
        print(f"  Didache wikisource fallback: {exc}")
    data = load_scrollmapper_etc(
        "church_history/ante-nicene/teaching-of-the-twelve-apostles/"
        "teaching-of-the-twelve-apostles.json"
    )
    payload = scrollmapper_to_forge(
        "Didache (Teaching of the Twelve)",
        data,
        "scrollmapper/bible_databases_deuterocanonical (Teaching of the Twelve Apostles)",
        renumber=True,
    )
    return payload["chapters"]


def fetch_three_maccabees() -> dict[str, str]:
    try:
        chapters = parse_wikisource_inline_verses(wikisource_wikitext("Translation:3_Maccabees"))
        if chapters:
            return chapters
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError):
        pass
    return bible_api_book_chapters("3 Maccabees", 7)


def fetch_four_maccabees() -> dict[str, str]:
    return bible_api_book_chapters("4 Maccabees", 18)


def fetch_three_enoch() -> dict[str, str]:
    md = fetch_text(f"{SCROLL_2024_RAW}/md/3-enoch/3-enoch.md")
    chapters: dict[str, list[tuple[int, str]]] = {}
    for ch, vs, text in re.findall(r"\*\*\[(\d+):(\d+)\]\*\*\s*(.+)", md):
        chapters.setdefault(ch, []).append((int(vs), re.sub(r"\s+", " ", text.strip())))
    out: dict[str, str] = {}
    for ch in sorted(chapters.keys(), key=int):
        lines = [f"{vs}. {txt}" for vs, txt in sorted(chapters[ch], key=lambda t: t[0])]
        out[str(int(ch))] = "\n".join(lines)
    return out


def fetch_pistis_sophia(merge_to: int = 6) -> dict[str, str]:
    raw_chapters: list[str] = []
    for n in range(1, 145):
        fname = f"Chapter%20{n:03d}.md"
        md = fetch_text(f"{PISTIS_BASE}/{fname}", timeout=60)
        verses = re.findall(r"^###\s+(\d+)\s*\n(.+?)(?=^###\s+\d+\s|\Z)", md, re.M | re.S)
        lines: list[str] = []
        for vnum, vtext in verses:
            text = re.sub(r"\s+", " ", vtext.strip())
            if text:
                lines.append(f"{vnum}. {text}")
        if lines:
            raw_chapters.append("\n".join(lines))
    if not raw_chapters:
        return {}
    if merge_to >= len(raw_chapters):
        return {str(i + 1): body for i, body in enumerate(raw_chapters)}
    buckets: list[list[str]] = [[] for _ in range(merge_to)]
    for i, body in enumerate(raw_chapters):
        buckets[i % merge_to].append(body)
    out: dict[str, str] = {}
    v = 1
    for i, parts in enumerate(buckets, start=1):
        lines: list[str] = []
        for part in parts:
            for line in part.split("\n"):
                line = line.strip()
                if not line:
                    continue
                if re.match(r"^\d+\.\s", line):
                    line = re.sub(r"^\d+\.\s", "", line)
                lines.append(f"{v}. {line}")
                v += 1
        if lines:
            out[str(i)] = "\n".join(lines)
    return out


def fetch_malan_conflict(max_chapters: int = 40) -> dict[str, str]:
    url = (
        "https://archive.org/stream/bookofadamandeve00malauoft/"
        "bookofadamandeve00malauoft_djvu.txt"
    )
    text = fetch_text(url, timeout=240)
    book_i = re.split(r"BOOK\s+II\.", text, maxsplit=1, flags=re.I)[0]
    parts = re.split(r"CHAPTER\s+([IVXLCDM\d]+)\.", book_i, flags=re.I)
    chunks: list[tuple[int, str]] = []
    for i in range(1, len(parts), 2):
        label, body = parts[i], parts[i + 1]
        try:
            ch_num = roman_to_int(label)
        except ValueError:
            continue
        body = re.sub(r"\s+", " ", body.strip())
        if body:
            chunks.append((ch_num, body))
    chunks.sort(key=lambda t: t[0])
    out: dict[str, str] = {}
    for ch_num, body in chunks[:max_chapters]:
        sentences = re.split(r"(?<=[.!?])\s+", body)
        lines = lines_to_chapter_body([s for s in sentences if s.strip()])
        if lines:
            out[str(ch_num)] = lines
    return renumber_chapters_sequential(out)


def urantiapedia_chapter_lines(book_slug: str, chapter: int) -> list[str]:
    url = f"https://urantiapedia.org/en/Bible/{book_slug}/{chapter}"
    page = fetch_text(url, timeout=60)
    # Content lives in wiki-markdown islands; grab paragraph-like lines.
    stripped = re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I)
    stripped = re.sub(r"<style[\s\S]*?</style>", " ", stripped, flags=re.I)
    stripped = re.sub(r"<[^>]+>", "\n", stripped)
    stripped = html.unescape(stripped)
    lines: list[str] = []
    for raw in stripped.split("\n"):
        line = re.sub(r"\s+", " ", raw.strip())
        if not line or len(line) < 20:
            continue
        if line.startswith("var ") or line.startswith("@import"):
            continue
        if "Urantiapedia" in line and chapter != 1:
            continue
        if re.match(r"^(Index|Testament|Treatise|Apocalypse)", line) and "Chapter" in line:
            continue
        if re.match(r"^\d+$", line):
            continue
        if re.match(r"^\d+\s+[A-Za-z]", line):
            line = re.sub(r"^\d+\s+", "", line)
        lines.append(line)
    return lines


def fetch_treatise_of_shem() -> dict[str, str]:
    out: dict[str, str] = {}
    for ch in range(1, 13):
        lines = urantiapedia_chapter_lines("Treatise_of_Shem", ch)
        body = lines_to_chapter_body(lines)
        if body:
            out[str(ch)] = body
    return out


def fetch_testament_of_adam() -> dict[str, str]:
    """Budge, Book of the Cave of Treasures — Testamentum Adami (4 conventional parts)."""
    page = fetch_text("https://sacred.plzhalp.us/chr/bct/bct10.htm", timeout=60)
    stripped = re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I)
    stripped = re.sub(r"<[^>]+>", "\n", stripped)
    stripped = html.unescape(stripped)
    text = re.sub(r"\s+", " ", stripped)
    markers = [
        ("THE HOURS OF THE DAY.", "THE HOURS OF THE NIGHT."),
        ("THE HOURS OF THE NIGHT.", "ADAM FORETELLS THE COMING OF CHRIST."),
        ("ADAM FORETELLS THE COMING OF CHRIST.", None),
    ]
    sections: list[str] = []
    for start, end in markers:
        i = text.find(start)
        if i < 0:
            continue
        chunk = text[i + len(start) :]
        if end:
            j = chunk.find(end)
            if j >= 0:
                chunk = chunk[:j]
        chunk = chunk.strip()
        if chunk:
            sections.append(chunk)
    if len(sections) >= 3:
        prophecy = sections[2]
        mid = len(prophecy) // 2
        split_at = prophecy.find(". ", mid)
        if split_at < 0:
            split_at = mid
        sections = [sections[0], sections[1], prophecy[: split_at + 1].strip(), prophecy[split_at + 1 :].strip()]
    out: dict[str, str] = {}
    for idx, section in enumerate(sections[:4], start=1):
        sentences = re.split(r"(?<=[.!?])\s+", section)
        body = lines_to_chapter_body([s for s in sentences if s.strip()])
        if body:
            out[str(idx)] = body
    return out


def fetch_apocalypse_of_zephaniah() -> dict[str, str]:
    lines = urantiapedia_chapter_lines("Apocalypse_of_Zephaniah", 1)
    return bucket_lines(lines, 12)


def fetch_martyrdom_of_isaiah() -> dict[str, str]:
    data = load_scrollmapper("ascension-of-isaiah/ascension-of-isaiah.json")
    book = data["books"][0]
    out: dict[str, str] = {}
    for ch in book.get("chapters") or []:
        ch_num = int(ch.get("chapter", 0))
        if 1 <= ch_num <= 5:
            body = chapter_to_lines(ch)
            if body:
                out[str(ch_num)] = body
    return out


def fetch_sefer_raziel() -> dict[str, str]:
    page = fetch_text("https://www.emol.org/kabbalah/seferraziel/chapters/chapter1.html", timeout=60)
    stripped = re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I)
    stripped = re.sub(r"<[^>]+>", "\n", stripped)
    stripped = html.unescape(stripped)
    paragraphs = [
        re.sub(r"\s+", " ", p.strip())
        for p in re.split(r"\n\s*\n", stripped)
        if len(p.strip()) > 80
    ]
    if not paragraphs:
        paragraphs = [
            re.sub(r"\s+", " ", p.strip())
            for p in stripped.split("\n")
            if len(p.strip()) > 80
        ]
    return bucket_lines(paragraphs, 7)


def forge_payload(
    forge_name: str,
    chapters: dict[str, str],
    *,
    translation: str,
    source: str,
    extra_aliases: list[str] | None = None,
) -> dict:
    aliases = list(ALIASES.get(forge_name, []))
    if extra_aliases:
        aliases.extend(extra_aliases)
    return {
        "book": forge_name,
        "aliases": aliases,
        "translation": translation,
        "source": source,
        "chapters": chapters,
    }


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

    extra_builders: dict[str, tuple] = {
        "Didache (Teaching of the Twelve)": (
            fetch_didache_chapters,
            "English (Lightfoot / ante-nicene corpus)",
            "Wikisource Didache (Lightfoot) + scrollmapper Teaching of the Twelve Apostles",
        ),
        "3 Maccabees": (
            fetch_three_maccabees,
            "English (public-domain translation)",
            "Wikisource Translation:3 Maccabees / bible-api.com",
        ),
        "4 Maccabees": (
            fetch_four_maccabees,
            "English (public-domain translation)",
            "bible-api.com (4 Maccabees)",
        ),
        "Sefer Yetzirah (Book of Formation)": (
            lambda: sefaria_bucketed(
                "Sefer_Yetzirah",
                6,
                "Sefaria — Sefer Yetzirah (community English)",
                forge_name,
            )["chapters"],
            "English (Sefaria community translation)",
            "Sefaria — Sefer Yetzirah",
        ),
        "Sefer HaBahir (Book of Brightness)": (
            lambda: sefaria_bucketed(
                "Sefer_HaBahir",
                5,
                "Sefaria — Sefer HaBahir (community English)",
                forge_name,
            )["chapters"],
            "English (Sefaria community translation)",
            "Sefaria — Sefer HaBahir",
        ),
        "3 Enoch (Hebrew Book of Enoch)": (
            fetch_three_enoch,
            "English (Odeberg / Trumpp tradition)",
            "scrollmapper/bible_databases_deuterocanonical (2024 branch md/3-enoch)",
        ),
        "Pistis Sophia": (
            lambda: fetch_pistis_sophia(6),
            "English (G.R.S. Mead)",
            "crucifly/bible-obsidian (Pistis Sophia, merged to 6 books)",
        ),
        "Conflict of Adam and Eve with Satan": (
            lambda: fetch_malan_conflict(40),
            "English (S. C. Malan, 1882)",
            "Internet Archive — Conflict of Adam and Eve with Satan (Malan)",
        ),
        "Treatise of Shem": (
            fetch_treatise_of_shem,
            "English (Mingana / Urantiapedia)",
            "Urantiapedia — Treatise of Shem (12 zodiac chapters)",
        ),
        "Testament of Adam": (
            fetch_testament_of_adam,
            "English (Bezold / Urantiapedia)",
            "Urantiapedia — Testament of Adam",
        ),
        "Apocalypse of Zephaniah": (
            fetch_apocalypse_of_zephaniah,
            "English (fragmentary; James / Urantiapedia)",
            "Urantiapedia — Apocalypse of Zephaniah (sections bucketed)",
        ),
        "Martyrdom of Isaiah": (
            fetch_martyrdom_of_isaiah,
            "English (public-domain apocrypha corpus)",
            "scrollmapper Ascension of Isaiah (chapters 1–5)",
        ),
        "Sefer Raziel HaMalakh": (
            fetch_sefer_raziel,
            "English (Emol.org Sefer Raziel excerpt)",
            "emol.org/kabbalah/seferraziel (chapter 1, bucketed to 7)",
        ),
    }
    if forge_name in extra_builders:
        fn, translation, source = extra_builders[forge_name]
        chapters = fn() if callable(fn) else {}
        if isinstance(chapters, dict) and chapters:
            return forge_payload(forge_name, chapters, translation=translation, source=source)

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
