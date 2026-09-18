#!/usr/bin/env bash
# Stitch Visual Package clips into one MP4.
# Usage:
#   bash scripts/stitch-visual-package.sh manifest.json [output.mp4]
#
# manifest.json — exported from Forge Visual Package (Export Manifest),
#   or any JSON with stitch.clipUrls: ["https://...", ...]

set -euo pipefail

MANIFEST="${1:?Usage: stitch-visual-package.sh manifest.json [output.mp4]}"
OUT="${2:-visual-package-output.mp4}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install: sudo apt-get install -y ffmpeg" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 required to parse manifest JSON." >&2
  exit 1
fi

mapfile -t URLS < <(python3 - "$MANIFEST" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
urls = []
if isinstance(data.get("stitch"), dict) and data["stitch"].get("clipUrls"):
    urls = [u for u in data["stitch"]["clipUrls"] if u]
elif isinstance(data.get("beats"), list):
    urls = [b.get("videoUrl") for b in data["beats"] if b.get("videoUrl")]
if not urls:
    sys.exit("No video URLs in manifest (stitch.clipUrls or beats[].videoUrl)")
for u in urls:
    print(u)
PY
)

echo "Downloading ${#URLS[@]} clip(s)..."
LIST="$WORKDIR/clips.txt"
: > "$LIST"
i=0
for url in "${URLS[@]}"; do
  i=$((i + 1))
  ext="mp4"
  case "$url" in
    *.webm) ext="webm" ;;
    *.mov) ext="mov" ;;
  esac
  dest="$WORKDIR/clip-$(printf '%02d' "$i").$ext"
  echo "  [$i/${#URLS[@]}] $url"
  curl -fsSL "$url" -o "$dest"
  printf "file '%s'\n" "$dest" >> "$LIST"
done

echo "Concatenating → $OUT"
ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$OUT" 2>/dev/null || \
ffmpeg -y -f concat -safe 0 -i "$LIST" -c:v libx264 -preset fast -crf 20 -c:a aac -movflags +faststart "$OUT"

echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
