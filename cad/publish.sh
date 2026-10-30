#!/usr/bin/env bash
# Compresses prepared parts and their baked shadowing into public/models/foundation.
set -e
cd "$(dirname "$0")"
OUT=../public/models/foundation
mkdir -p "$OUT"
rm -f "$OUT"/*
for f in parts/*.prepared.glb; do
  n=$(basename "$f" .prepared.glb)
  npx --yes @gltf-transform/cli@4 meshopt "$f" "$OUT/$n.glb" --level medium --quantize-normal 12 --quantize-position 16 >/dev/null
  uv run --quiet --no-project --with pillow python -I combine_maps.py "parts/$n.ao.png" "parts/$n.edge.png" "$OUT/$n.ao.webp"
done
