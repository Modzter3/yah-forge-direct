#!/usr/bin/env python3
"""
Strip duplicate Part/Episode headings from combined sermon markdown.

Mirrors stripLeadingPartHeading() in public/index.html so exported .md files
match what Copy All / library assembly produces in the browser.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PART_HEADING_RE = re.compile(
    r"^#+\s*(?:PART|Part|EPISODE|Episode)\s*\d+\s*[:\-–—]+\s*.+\n+",
    re.MULTILINE,
)
STANDALONE_H1_RE = re.compile(r"^#\s+(?!#).+\n+", re.MULTILINE)
ASSEMBLY_PART_RE = re.compile(
    r"^#\s*PART\s+(\d+)\s*--\s*(.+?)\s*\n\n",
    re.MULTILINE | re.IGNORECASE,
)


def strip_leading_part_heading(text: str) -> str:
    if not text:
        return text
    out = text.lstrip("\ufeff").lstrip()
    while True:
        m = PART_HEADING_RE.match(out)
        if not m:
            break
        out = out[m.end() :]
    m = STANDALONE_H1_RE.match(out)
    if m:
        out = out[m.end() :]
    return out.lstrip("\n")


def dedupe_combined_markdown(text: str) -> str:
    """Process forge-style combined output: # PART N -- title blocks separated by ---."""
    chunks = re.split(r"\n---\n", text)
    if len(chunks) <= 1:
        return strip_leading_part_heading(text)

    out_chunks: list[str] = []
    for chunk in chunks:
        piece = chunk.strip("\n")
        if not piece:
            continue
        m = ASSEMBLY_PART_RE.match(piece)
        if m:
            part_num, title = m.group(1), m.group(2).strip()
            body = strip_leading_part_heading(piece[m.end() :])
            out_chunks.append(f"# PART {part_num} -- {title}\n\n{body}".rstrip())
        else:
            out_chunks.append(strip_leading_part_heading(piece).rstrip())

    return "\n\n---\n\n".join(out_chunks) + ("\n" if text.endswith("\n") else "")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove duplicate Part/Episode headings from sermon markdown."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help="Markdown files to process (default: stdin)",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Write result to this file instead of stdout",
    )
    parser.add_argument(
        "-i",
        "--in-place",
        action="store_true",
        help="Rewrite each input file in place",
    )
    args = parser.parse_args()

    if args.in_place and args.output:
        parser.error("Use either --in-place or --output, not both")

    if not args.paths:
        raw = sys.stdin.read()
        result = dedupe_combined_markdown(raw)
        if args.in_place:
            parser.error("--in-place requires at least one input path")
        if args.output:
            Path(args.output).write_text(result, encoding="utf-8")
        else:
            sys.stdout.write(result)
        return 0

    for path_str in args.paths:
        path = Path(path_str)
        raw = path.read_text(encoding="utf-8")
        result = dedupe_combined_markdown(raw)
        if args.in_place:
            path.write_text(result, encoding="utf-8")
        elif args.output and len(args.paths) == 1:
            Path(args.output).write_text(result, encoding="utf-8")
        else:
            if len(args.paths) > 1:
                sys.stdout.write(f"## {path}\n\n")
            sys.stdout.write(result)
            if len(args.paths) > 1:
                sys.stdout.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
