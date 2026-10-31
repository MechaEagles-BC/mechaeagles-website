"""Places the rocks, the landed ship, its crates and the far convoy, and writes space_placements.json and the import list.
Composed with the art-direction skill: the platform stays the hero, on clear ground. One story at a time: a ship has landed, a convoy is leaving.
No guns, mines, grenades or enemy drones from the kit, because nothing on this site should suggest weapons.
Run: uv run --no-project --with numpy python -I unreal/space_scatter.py"""
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(globals().get("__file__", "space_scatter.py")).resolve().parent
sys.path.insert(0, str(HERE))
from space_height import height, world_at_film  # noqa: E402

rng = np.random.default_rng(47)
items, glows = [], []


def ground(x, y):
    return float(height(np.array([float(x)]), np.array([float(y)]))[0])


def put(name, x, y, scale=1.0, yaw=None, lift=0.0, pack="scifi"):
    items.append({"name": name, "pack": pack, "x": round(float(x), 3), "y": round(float(y), 3), "z": round(ground(x, y) + lift, 3), "pitch": 0.0, "roll": 0.0, "yaw": round(float(rng.random() * 360 if yaw is None else yaw), 1), "scale": round(float(scale), 3)})


def fly(name, u, v, distance, length, yaw, pitch, roll):
    """A ship in the sky, placed by where it shows on the film. length is how long it is in metres."""
    p = world_at_film(u, v, distance)
    items.append({"name": name, "pack": "ships", "x": round(float(p[0]), 2), "y": round(float(p[1]), 2), "z": round(float(p[2]), 2), "pitch": pitch, "roll": roll, "yaw": yaw, "scale": round(float(length / SHIP_LENGTH[name]), 3), "sky": True})


# ---------- rock: prospect and refuge. A dark mass near on the left, a lighter one further back on the right, the middle clear ----------
for x, y, s, yaw in ((-22, 13, 6.6, 30), (-26, 18, 9.5, 140), (-18.6, 15, 2.9, 210), (-31, 24, 7.4, 75), (-20.5, 9.5, 1.9, 300)):
    put(f"Rock_{int(rng.integers(1, 6))}", x, y, s, yaw, -0.45, "nature")
for x, y, s, yaw in ((35, 27, 5.6, 200), (38, 34, 7.2, 80), (31.5, 29, 2.4, 10)):
    put(f"Rock_{int(rng.integers(1, 6))}", x, y, s, yaw, -0.4, "nature")

# Small stones in clumps past the rim, so the ground has scale. Nothing inside it.
for cx, cy, n, spread in ((-13.5, 9, 7, 3.2), (16, 12, 6, 3.4), (-20, 22, 8, 4.5), (9, 25, 5, 3), (19, -8, 5, 2.4), (-14, -11, 5, 2.2), (-5, 40, 9, 8), (34, 52, 9, 9)):
    for k in range(n):
        a, d = rng.random() * math.tau, rng.random() ** 0.7 * spread
        put(f"Rock_{int(rng.integers(1, 6))}", cx + math.cos(a) * d, cy + math.sin(a) * d * 0.7, 0.2 + rng.random() ** 2 * 0.65, None, -0.05, "nature")

# ---------- the landing: a saucer on the horizon, in the gap left of the hologram where no card or caption covers it, with its cargo beside it ----------
LANDER = (-12.5, 43.0)
put("Pancake", *LANDER, 0.92, 200, 1.0, "ships")
# The dish stands alone in the matching gap on the right.
put("Prop_SatelliteDish", 11.5, 47, 1.25, 215, 0.0)
for name, dx, dy, s, yaw in (("Prop_Crate_Large", -9.5, -2.0, 1.25, 28), ("Prop_Crate", -7.5, -3.4, 1.15, 70), ("Prop_Crate", -9.2, -4.3, 1.15, 12), ("Prop_Barrel1", -6.2, -1.3, 1.25, 0)):
    put(name, LANDER[0] + dx, LANDER[1] + dy, s, yaw, 0.0)
# Landing lights, a soft pale row and nothing coloured.
for k in range(4):
    a = k / 4 * math.tau + 0.4
    x, y = LANDER[0] + math.cos(a) * 7.5, LANDER[1] + math.sin(a) * 7.5
    glows.append({"x": x, "y": y, "z": ground(x, y) + 0.1, "scale": 0.3})

SHIP_LENGTH = {"Imperial": 18.55, "Zenith": 12.07, "Bob": 5.61, "Challenger": 10.18}
# The flying ships are live now (src/components/Space.tsx), so they can move. Only the landed saucer stays in the picture.

(HERE / "space_placements.json").write_text(json.dumps({"items": items, "glows": glows}))

paths = []
for pack, name in sorted({(p["pack"], p["name"]) for p in items}):
    root = HERE / "assets" / pack
    found = [p for p in root.rglob(name + ".gltf")]
    if not found:
        raise SystemExit("missing model: " + name)
    paths.append({"name": name, "path": str(found[0]), "pack": pack})
(HERE / "space_list.json").write_text(json.dumps(paths))
print("placements", len(items), "models", len(paths))
