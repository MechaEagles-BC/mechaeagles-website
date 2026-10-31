"""Works out, for each valley plate, what moves in the wind. Red is detailed foliage and tufts, green is open meadow, blue is sky.
Run: uv run --no-project --with numpy --with pillow --with scipy python -I unreal/valley_masks.py"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, uniform_filter

HERE = Path(globals().get("__file__", "valley_masks.py")).resolve().parent
PLATES = HERE.parent / "public" / "plate"
# Height of each plate in films, and how far its film's top edge is from the plate's top.
SHAPES = {"valley": (1.0, 0.0), "valley-wide": (1.0, 0.0), "valley-tall": (10 / 3, (10 / 3 - 1) / 2)}


def smooth(a, b, t):
    k = np.clip((t - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


for name, (height, top) in SHAPES.items():
    img = np.asarray(Image.open(PLATES / f"{name}.webp").convert("RGB"), dtype=np.float32) / 255
    h, w, _ = img.shape
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    grey = img.mean(-1)
    # film y runs 0 at the film's top edge and 1 at its bottom, and goes outside that in the tall plate
    y = (np.arange(h)[:, None] / h * height - top) * np.ones((h, w))
    scale = w / (2400 if name == "valley-wide" else 1600 if name == "valley" else 960)
    size = max(3, int(9 * scale))
    mean = uniform_filter(grey, size)
    busy = np.sqrt(np.maximum(uniform_filter(grey * grey, size) - mean * mean, 0))
    # Sky is bluer than it is green. The far haze is greener, so it stays still.
    sky = smooth(-0.005, 0.03, b - g) * smooth(0.36, 0.25, y)
    leaves = smooth(0.018, 0.06, busy) * (1 - sky)
    # Above the meadow's far edge, detail means trees and they move fully. Below it, it means tufts and their shadows, which move less.
    tall = smooth(0.36, 0.28, y)
    wind = leaves * (0.2 + 0.8 * tall)
    # Things that sit low in a tree's own shape move less than its crown: fade near the very bottom of tufts by softening.
    wind = gaussian_filter(wind, 2.2 * scale)
    meadow = smooth(0.25, 0.33, y) * (1 - smooth(0.05, 0.14, gaussian_filter(sky, 2)))
    sky = gaussian_filter(sky, 3 * scale)
    out = np.stack([np.clip(wind * 1.5, 0, 1), meadow, sky], -1)
    im = Image.fromarray((out * 255 + 0.5).astype(np.uint8)).resize((w // 2, h // 2), Image.BILINEAR)
    im.save(PLATES / f"{name}-mask.webp", quality=86)
    print(name, im.size, (PLATES / f"{name}-mask.webp").stat().st_size)
