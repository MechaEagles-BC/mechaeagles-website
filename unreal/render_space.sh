#!/usr/bin/env bash
# Renders the three space plates and writes the web copies. Run after go_space.sh or a rebuild.
cd "$(dirname "$0")"; D=$(cygpath -m "$PWD")
U="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor"; UP="C:/Users/vedar/UnrealProjects/HangarIgnition/HangarIgnition.uproject"
for what in space space-wide space-tall; do
  "$U.exe" "$UP" -ExecCmds="py $D/mc_render.py $what final" -nop4 -nosplash -abslog="$D/parts/render.log" >/dev/null 2>&1; grep -E 'MC RENDER DONE' parts/render.log | cut -c30-60
done
uv run --quiet --no-project --with pillow python -I -c "
from PIL import Image
for src, out, size in (('space', 'space', (1600, 1200)), ('space-wide', 'space-wide', (2400, 1200)), ('space-tall', 'space-tall', (960, 2400))):
    Image.open(f'render/{src}_final/00.png').convert('RGB').resize(size, Image.LANCZOS).save(f'../public/plate/{out}.webp', quality=84, method=6)
"
ls -la ../public/plate/ | grep space
