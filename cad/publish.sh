#!/usr/bin/env bash
# Compresses prepared parts and their baked shadowing into public/models/foundation.
set -e
cd "$(dirname "$0")"
OUT=../public/models/foundation
mkdir -p "$OUT"
rm -f "$OUT"/*
for f in parts/*.prepared.glb; do
  n=$(basename "$f" .prepared.glb)
  npx --yes @gltf-transform/cli@4 meshopt "$f" "$OUT/$n.glb" --level medium >/dev/null
  ffmpeg -y -loglevel error -i "parts/$n.ao.png" -vf "scale='min(1024,iw)':-1,format=gray" -c:v libwebp -quality 72 "$OUT/$n.ao.webp"
done
