#!/usr/bin/env bash
# Push yah-forge-port/ to Modzter3/yah-forge (requires YAH_FORGE_SYNC_TOKEN with repo push).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN="${YAH_FORGE_SYNC_TOKEN:-${GITHUB_TOKEN:-}}"
BRANCH="${YAH_FORGE_BRANCH:-cursor/port-forge-direct-features-34e9}"
TARGET="Modzter3/yah-forge"

if [[ -z "$TOKEN" ]]; then
  echo "Set YAH_FORGE_SYNC_TOKEN (fine-grained PAT with push to $TARGET)" >&2
  exit 1
fi

bash "$ROOT/scripts/build-yah-forge-port.sh"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
git clone "https://x-access-token:${TOKEN}@github.com/${TARGET}.git" "$WORKDIR/repo"
cd "$WORKDIR/repo"
git checkout -B "$BRANCH"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'docs' \
  "$ROOT/yah-forge-port/" ./

git add -A
git diff --staged --quiet && { echo "Nothing to commit"; exit 0; }
git -c user.email="cursor-agent@users.noreply.github.com" -c user.name="Cursor Agent" \
  commit -m "Port yah-forge-direct features (Poe billing unchanged)

Sync from yah-forge-direct main via yah-forge-port build.
Keeps api/poe.js and /api/poe polyfill — no OpenRouter routing."

git push -u origin "$BRANCH"
echo "Pushed $BRANCH to https://github.com/$TARGET"
