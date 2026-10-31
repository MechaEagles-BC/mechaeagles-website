"""Places the CC0 Quaternius models around the landscape and writes placements.json, plus the import list.
Metres, viewer on -Y, as in landscape.py. Composed by the art-direction skill: one hero on a clear lawn, asymmetric framing, groups instead of sprinkles.
The props are saved for the team pages.
Also sets foliage to alpha-masked in the glTF copies: Unreal renders masked leaves far better than blended ones.
Run: uv run --no-project --with numpy python -I unreal/scatter.py"""
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(globals().get("__file__", "scatter.py")).resolve().parent
sys.path.insert(0, str(HERE))
from land_height import fbm, height, path_centre  # noqa: E402

rng = np.random.default_rng(61)
PANELS = [(-8.92, -5.15), (-8.92, 5.15), (8.92, 5.15), (8.92, -5.15)]
placements = []


def ground(x, y):
    return float(height(np.array([float(x)]), np.array([float(y)]))[0])


def put(name, x, y, scale=1.0, yaw=None, lift=0.0, pack="nature"):
    placements.append({"name": name, "pack": pack, "x": round(float(x), 3), "y": round(float(y), 3), "z": round(ground(x, y) + lift, 3), "yaw": round(float(rng.random() * 360 if yaw is None else yaw), 1), "scale": round(float(scale), 3)})


def clear(x, y, margin=0.0):
    if math.hypot(x, y) < 10.2 + margin:
        return False
    return all(math.hypot(x - px, y - py) > 1.6 + margin for px, py in PANELS)


def on_path(x, y, width):
    return 9 < y < 96 and abs(x - float(path_centre(np.array([float(y)]))[0])) < width


# ---------- trees: prospect and refuge. A heavy canopy near on the left, a lighter pair further back on the right, the middle open ----------
FRAME = (("MapleTree_1", -18.5, 3, 3.9, 40), ("NormalTree_1", -24, 13, 3.1, 200), ("BirchTree_2", 20, 25, 3.3, 60), ("BirchTree_4", 25, 31, 3.0, 110))
for name, x, y, s_, yaw in FRAME:
    put(name, x, y, s_, yaw)


def grove(cx, cy, n, spread, kinds):
    for k in range(n):
        a_, d = rng.random() * math.tau, rng.random() ** 0.6 * spread
        x, y = cx + math.cos(a_) * d, cy + math.sin(a_) * d * 0.7
        put(kinds[int(rng.integers(len(kinds)))], x, y, 2.6 + rng.random() * 0.9)


broad = [f"MapleTree_{i}" for i in range(1, 6)] + [f"NormalTree_{i}" for i in range(1, 5)]
light = [f"BirchTree_{i}" for i in range(1, 6)]
pine = [f"PineTree_{i}" for i in (1, 2, 4, 5)]
grove(-46, 42, 7, 13, broad)  # left mass
grove(-82, 95, 9, 22, broad + pine)
grove(-55, 170, 7, 22, pine)
grove(44, 74, 9, 15, light + broad)  # hides the end of the path, so the view promises more
grove(31, 94, 6, 7, broad)  # right at the path's end
grove(95, 120, 8, 24, broad + pine)
grove(35, 215, 8, 26, pine)
grove(-130, 240, 9, 30, pine)

# ---------- rocks: two outcrops, tucked against the trees ----------
for cx, cy, n in ((-19, 12, 3), (17, 27, 3)):
    for k in range(n):
        a_, d = rng.random() * math.tau, rng.random() * 1.6
        put(f"Rock_{int(rng.integers(1, 6))}", cx + math.cos(a_) * d, cy + math.sin(a_) * d, 1.3 + rng.random() * 1.1, None, -0.1)

# ---------- bushes: gathered at the feet of the framing trees ----------
bushes = ["Bush", "Bush_Large", "Bush_Small"]
for name, tx, ty, s_, yaw in FRAME:
    for k in range(5):
        a_, d = rng.random() * math.tau, 2 + rng.random() * 3.5
        x, y = tx + math.cos(a_) * d, ty + math.sin(a_) * d
        if clear(x, y, 3):
            put(bushes[int(rng.integers(len(bushes)))], x, y, 1.0 + rng.random() * 0.8)

# ---------- flowers: white and pale yellow only, so no flower competes with a team colour; in drifts, beyond the lawn ----------
flowers = ["Flower_1_Clump", "Flower_4_Clump", "Flower_2_Clump", "Flower_3_Clump"]
count, tries = 0, 0
while count < 380 and tries < 60000:
    tries += 1
    x = (rng.random() * 2 - 1) * 60
    y = 13 + rng.random() ** 1.1 * 70
    if on_path(x, y, 2.5) or fbm(np.array([x / 9 + 40]), np.array([y / 9]), 3)[0] < 0.58:
        continue
    put(flowers[int(fbm(np.array([x / 20 + 9]), np.array([y / 20]), 2)[0] * 13) % 4], x, y, 1.0 + rng.random() * 0.4)
    count += 1

# ---------- grass: low near the rim so the platform sits in it, fuller in the meadow, short across the foreground ----------
count = 0
while count < 4200:
    x = (rng.random() * 2 - 1) * 58
    y = -19 + rng.random() ** 1.3 * 100
    r = math.hypot(x, y)
    if not clear(x, y, 0.3) or on_path(x, y, 1.9):
        continue
    if fbm(np.array([x / 11 + 70]), np.array([y / 11]), 2)[0] < 0.44:  # patches, not an even carpet
        continue
    near = min(1.0, max(0.0, (r - 10) / 16))
    put("Grass_Large" if rng.random() < 0.6 else "Grass_Small", x, y, 0.8 + near * 0.6 + rng.random() * 0.35)
    count += 1
torches = []

(HERE / "placements.json").write_text(json.dumps({"items": placements, "torches": torches}))

# ---------- the import list, with foliage set to masked ----------
names = sorted({(p["pack"], p["name"]) for p in placements})
paths = []
for pack, name in names:
    found = [p for p in (HERE / "assets" / pack).rglob(name + ".gltf")]
    if not found:
        raise SystemExit("missing model: " + name)
    path = found[0]
    data = json.loads(path.read_text(encoding="utf8"))
    for m in data.get("materials", []):
        if m.get("alphaMode") == "BLEND":  # both packs and the FBX conversions
            m["alphaMode"] = "MASK"
            m["alphaCutoff"] = 0.35
    path.write_text(json.dumps(data), encoding="utf8")
    paths.append({"name": name, "path": str(path)})
(HERE / "kit_list.json").write_text(json.dumps(paths))
print("placements", len(placements), "models", len(paths), "torches", len(torches))
