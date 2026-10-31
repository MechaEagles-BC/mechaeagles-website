#!/usr/bin/env bash
# Rebuilds the valley without its live trees and tufts, and writes the three web plates and their masks.
cd "$(dirname "$0")"; D=$(cygpath -m "$PWD")
U="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor"; UP="C:/Users/vedar/UnrealProjects/HangarIgnition/HangarIgnition.uproject"
uv run --quiet --no-project --with numpy python -I -c "import sys; sys.path.insert(0, '.'); __file__='scatter.py'; exec(open('scatter.py', encoding='utf8').read())"
"$U.exe" "$UP" -ExecutePythonScript="$D/run_and_quit.py land_build.py" -unattended -nosplash -abslog="$D/parts/build.log" >/dev/null 2>&1; grep -E 'MC BUILD OK|SCRIPT FAILED' parts/build.log | sed 's/.*LogPython: //' | cut -c1-120
for what in plate wide tall; do
  "$U.exe" "$UP" -ExecCmds="py $D/mc_render.py $what final" -nop4 -nosplash -abslog="$D/parts/render.log" >/dev/null 2>&1; grep -E 'MC RENDER DONE' parts/render.log | cut -c30-50
done
uv run --quiet --no-project --with pillow python -I -c "
from PIL import Image
for src, out, size in (('plate', 'valley', (1600, 1200)), ('wide', 'valley-wide', (2400, 1200)), ('tall', 'valley-tall', (960, 2400))):
    Image.open(f'render/{src}_final/00.png').convert('RGB').resize(size, Image.LANCZOS).save(f'../public/plate/{out}.webp', quality=84, method=6)
"
uv run --quiet --no-project --with numpy --with pillow --with scipy python -I valley_masks.py
