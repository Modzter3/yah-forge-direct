#!/usr/bin/env bash
# Push yah-forge-port/ to Modzter3/yah-forge (requires YAH_FORGE_SYNC_TOKEN with repo push).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN="${YAH_FORGE_SYNC_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "$TOKEN" ]] && command -v gh >/dev/null 2>&1; then
  TOKEN="$(gh auth token 2>/dev/null || true)"
fi
BRANCH="${YAH_FORGE_BRANCH:-cursor/port-forge-direct-features-34e9}"
TARGET="Modzter3/yah-forge"

if [[ -z "$TOKEN" ]]; then
  echo "Set YAH_FORGE_SYNC_TOKEN (fine-grained PAT with push to $TARGET)" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
git clone "https://x-access-token:${TOKEN}@github.com/${TARGET}.git" "$WORKDIR/repo"

YAH_FORGE_SRC="$WORKDIR/repo" bash "$ROOT/scripts/build-yah-forge-port.sh"

cd "$WORKDIR/repo"
git checkout -B "$BRANCH"

# Copy port files only — preserve docs/, README.md, and other upstream-only paths
cp "$ROOT/yah-forge-port/public/index.html" public/index.html
cp "$ROOT/yah-forge-port/public/poe-polyfill.js" public/poe-polyfill.js
cp "$ROOT/yah-forge-port/api/poe.js" api/poe.js
cp "$ROOT/yah-forge-port/vercel.json" vercel.json
cp "$ROOT/yah-forge-port/scripts/adapt-index-for-poe.py" scripts/
cp "$ROOT/yah-forge-port/scripts/build-yah-forge-port.sh" scripts/
cp "$ROOT/yah-forge-port/scripts/dedupe-sermon.py" scripts/
cp "$ROOT/yah-forge-port/scripts/extract-forge-from-transcript.mjs" scripts/ 2>/dev/null || true
[[ -f "$ROOT/yah-forge-port/PORT.md" ]] && cp "$ROOT/yah-forge-port/PORT.md" .

git add public/ api/ vercel.json scripts/ PORT.md 2>/dev/null || git add public/ api/ vercel.json scripts/
git diff --staged --quiet && { echo "Nothing to commit"; exit 0; }
git -c user.email="cursor-agent@users.noreply.github.com" -c user.name="Cursor Agent" \
  commit -m "Port yah-forge-direct features (Poe billing unchanged)

Sync from yah-forge-direct main via yah-forge-port build.
Keeps api/poe.js and /api/poe polyfill — no OpenRouter routing."

git push -u origin "$BRANCH"
echo "Pushed $BRANCH to https://github.com/$TARGET"
