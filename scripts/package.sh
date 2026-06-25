#!/usr/bin/env bash
# Package the built extension into a distributable zip.
# Run after `npm run build` (or use `npm run package`, which builds first).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
OUT="$ROOT/platformeq-eml-viewer.zip"

if [ ! -f "$DIST/manifest.json" ]; then
  echo "error: $DIST/manifest.json not found — run 'npm run build' first." >&2
  exit 1
fi

rm -f "$OUT"
# Zip the CONTENTS of dist/ (so manifest.json is at the zip root, as Chrome expects).
( cd "$DIST" && zip -rq "$OUT" . )
echo "Packaged: $OUT"
unzip -l "$OUT" | tail -n +2 | head -n 20
