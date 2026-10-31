#!/usr/bin/env bash
# Renders the moon on black and on white for all three plates, and writes web copies with a clean transparent sky.
cd "$(dirname "$0")"; D=$(cygpath -m "$PWD")
U="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor"; UP="C:/Users/vedar/UnrealProjects/HangarIgnition/HangarIgnition.uproject"
for what in space space-matte space-wide space-wide-matte space-tall space-tall-matte; do
  "$U.exe" "$UP" -ExecCmds="py $D/mc_render.py $what final" -nop4 -nosplash -abslog="$D/parts/render.log" >/dev/null 2>&1; grep -E 'MC RENDER DONE' parts/render.log | cut -c30-50
done
uv run --quiet --no-project --with numpy --with pillow python -I -c "
from PIL import Image
import numpy as np
for name, size in (('space', (1600, 1200)), ('space-wide', (2400, 1200)), ('space-tall', (960, 2400))):
    black = np.asarray(Image.open(f'render/{name}_final/00.png').convert('RGB'), dtype=np.float32) / 255
    white = np.asarray(Image.open(f'render/{name}-matte_final/00.png').convert('RGB'), dtype=np.float32) / 255
    alpha = np.clip(1 - (white - black).mean(-1) / max((white - black).mean(-1).max(), 1e-3), 0, 1)
    colour = np.where(alpha[..., None] > 0.01, np.clip(black / np.maximum(alpha[..., None], 0.01), 0, 1), 0)
    out = (np.dstack([colour, alpha]) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out, 'RGBA').resize(size, Image.LANCZOS).save(f'../public/plate/{name}.webp', quality=84, alpha_quality=92, method=6)
    print(name, 'sky share', round(float((alpha < 0.5).mean()), 3))
"
ls -la ../public/plate/ | grep space
