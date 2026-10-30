"""Solves every photo's camera and the building's proportions together from hand-picked landmarks.
Scale comes only from the unverified 61 m tip height, so results are proportions rather than surveyed sizes.
Pixel positions were read by eye from images 1400 px wide, so expect a few pixels of noise in each.
Run: uv run --no-project --with numpy --with scipy --with pillow python gasson/landmark_fit.py <overlay_dir>
"""
import copy
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.optimize import least_squares

import massing

HERE = Path(__file__).parent
REF = HERE.parent / "reference" / "gasson"
OUT = Path(sys.argv[1])
FROM_DISPLAY = 1400 / 1351  # the portrait photos were read at 1351 px wide

PHOTOS = {
    "quad-2018.jpg": (1, {
        "tipL": (697, 468), "tipR": (814, 462), "cross": (755, 558), "corniceL": (675, 628), "corniceR": (850, 625),
        "bay": (752, 880), "gableL": (405, 858), "gableR": (1060, 838), "wallL": (335, 938), "wallR": (1147, 925),
        "groundL": (325, 1240), "groundR": (1158, 1240),
    }),
    "tower-postcard.jpg": (1, {
        "tipL": (609, 52), "tipR": (728, 58), "cross": (672, 125), "corniceL": (583, 200), "corniceR": (763, 205),
        "bay": (688, 455), "gableL": (374, 388), "gableR": (1063, 396), "wallL": (277, 515), "wallR": (1152, 520),
        "groundL": (262, 820), "groundR": (1178, 790),
    }),
    "modern-2011.jpg": (FROM_DISPLAY, {
        "tipL": (548, 150), "tipR": (760, 95), "cross": (637, 255), "corniceL": (480, 395), "corniceR": (795, 345),
        "bay": (585, 825), "gableR": (1190, 445),
    }),
    "from-fulton.jpg": (FROM_DISPLAY, {
        "tipL": (597, 335), "tipR": (745, 335), "cross": (670, 435), "corniceL": (565, 515), "corniceR": (775, 515),
        "bay": (665, 835),
    }),
}
# Shape values the solve may move: (group, key), and how strongly each is held near its first estimate.
SHAPE = [
    (("tower", "half_w"), 0.3), (("tower", "top"), 0.1), (("cross", "z1"), 0.1), (("bay", "peak"), 0.1), (("bay", "y0"), 1.0),
    (("wing", "x1"), 0.1), (("wing", "x0"), 0.1), (("wing", "y0"), 1.0), (("wing", "wall"), 0.1), (("wing", "peak"), 0.1), (("turret", "inset"), 1.0),
]


def params_from(shape):
    p = copy.deepcopy(massing.P)
    for ((group, key), _), value in zip(SHAPE, shape):
        p[group][key] = float(value)
    return p


def world(p):
    t, u, b, w, c = p["tower"], p["turret"], p["bay"], p["wing"], p["cross"]
    ix = t["half_w"] - u["inset"]
    iy = t["y0"] + u["inset"]
    gx = (w["x0"] + w["x1"]) / 2
    return {
        "tipL": (-ix, iy, p["tip"]), "tipR": (ix, iy, p["tip"]), "cross": (0, t["y0"] + 0.3, c["z1"]),
        "corniceL": (-t["half_w"], t["y0"], t["top"]), "corniceR": (t["half_w"], t["y0"], t["top"]),
        "bay": (0, b["y0"], b["peak"]), "gableL": (-gx, w["y0"], w["peak"]), "gableR": (gx, w["y0"], w["peak"]),
        "wallL": (-w["x1"], w["y0"], w["wall"]), "wallR": (w["x1"], w["y0"], w["wall"]),
        "groundL": (-w["x1"], w["y0"], 0), "groundR": (w["x1"], w["y0"], 0),
    }


def project(pts, cam, width, height):
    cx, cy, cz, yaw, pitch, f, roll = cam
    a, b = np.radians(yaw), np.radians(pitch)
    fwd = np.array([np.sin(a) * np.cos(b), np.cos(a) * np.cos(b), np.sin(b)])
    right = np.array([np.cos(a), -np.sin(a), 0.0])
    up = np.cross(right, fwd)
    r = np.radians(roll)
    right, up = right * np.cos(r) + up * np.sin(r), up * np.cos(r) - right * np.sin(r)
    d = np.asarray(pts, float) - np.array([cx, cy, cz])
    z = np.maximum(d @ fwd, 0.1)
    return np.stack([width / 2 + f * width * (d @ right) / z, height / 2 - f * width * (d @ up) / z], 1)


sizes = {}
for name in PHOTOS:
    sizes[name] = ImageOps.exif_transpose(Image.open(REF / name)).size
    w, h = sizes[name]
    sizes[name] = (1400, round(h * 1400 / w))

names = list(PHOTOS)
shape0 = np.array([massing.P[g][k] for (g, k), _ in SHAPE], float)
weights = np.array([wt for _, wt in SHAPE])
starts = {
    "quad-2018.jpg": [-5, -110, 6, 0, 9, 1.0, 0],
    "tower-postcard.jpg": [3, -75, 15, 0, 8, 0.8, 0],
    "modern-2011.jpg": [20, -45, 2, -15, 25, 0.75, 0],
    "from-fulton.jpg": [0, -190, 2, 0, 12, 1.7, 0],
}


def unpack(x):
    return x[: len(SHAPE)], {n: x[len(SHAPE) + 7 * i : len(SHAPE) + 7 * (i + 1)] for i, n in enumerate(names)}


def residuals(x):
    shape, cams = unpack(x)
    wld = world(params_from(shape))
    out = []
    for n in names:
        scale, marks = PHOTOS[n]
        keys = list(marks)
        got = project([wld[k] for k in keys], cams[n], *sizes[n])
        want = np.array([marks[k] for k in keys], float) * scale
        out.append((got - want).ravel())
    out.append((shape - shape0) * weights)  # a gentle pull toward the first estimate, for values photos barely constrain
    return np.concatenate(out)


x0 = np.concatenate([shape0] + [np.array(starts[n], float) for n in names])
# Depth and height can trade against each other when views are similar, so limit what other evidence already settles:
# the 1923 aerial shows the end wings only slightly proud of the facade, and each photo was taken well out on the ground.
low = np.full_like(x0, -np.inf)
high = np.full_like(x0, np.inf)
for i, ((g, k), _) in enumerate(SHAPE):
    if (g, k) == ("wing", "y0"):
        low[i], high[i] = -3.5, -2.5  # depth: read from the aerial, because these photos cannot settle it
    if (g, k) == ("bay", "y0"):
        low[i], high[i] = -2.0, -1.0  # depth: as above
    if (g, k) == ("turret", "inset"):
        low[i], high[i] = 0.5, 2.5
for i, n in enumerate(names):
    at = len(SHAPE) + 7 * i
    low[at + 1], high[at + 1] = {"quad-2018.jpg": (-170, -70), "tower-postcard.jpg": (-170, -55), "modern-2011.jpg": (-90, -30), "from-fulton.jpg": (-260, -90)}[n]
    low[at + 2], high[at + 2] = 0.5, 22.0
    low[at + 5], high[at + 5] = 0.4, 3.0
x0 = np.clip(x0, low + 1e-3, high - 1e-3)
sol = least_squares(residuals, x0, bounds=(low, high), loss="soft_l1", f_scale=8.0, max_nfev=4000)
shape, cams = unpack(sol.x)
final = params_from(shape)
wld = world(final)

report = {}
for n in names:
    scale, marks = PHOTOS[n]
    keys = list(marks)
    got = project([wld[k] for k in keys], cams[n], *sizes[n])
    want = np.array([marks[k] for k in keys], float) * scale
    err = np.hypot(*(got - want).T)
    tip_y = project([wld["tipL"]], cams[n], *sizes[n])[0][1]
    # error as a share of the building's height in that photo, measured at the tower
    base = project([(0, final["tower"]["y0"], 0)], cams[n], *sizes[n])[0][1]
    span = abs(base - tip_y)
    report[n] = {"rms_px": round(float(np.sqrt((err**2).mean())), 1), "max_px": round(float(err.max()), 1), "worst": keys[int(err.argmax())], "rms_pct_of_height": round(float(np.sqrt((err**2).mean()) / span * 100), 2)}
    print(n, report[n], "camera", [round(float(v), 1) for v in cams[n]])

    mesh = massing.build(final)
    verts = project(mesh.verts, cams[n], *sizes[n])
    img = ImageOps.exif_transpose(Image.open(REF / n)).convert("RGB").resize(sizes[n])
    dr = ImageDraw.Draw(img)
    for face in mesh.faces:
        pts = [tuple(verts[i - 1]) for i in face]
        dr.line(pts + [pts[0]], fill=(40, 255, 240), width=2)
    for k, g, wn in zip(keys, got, want):
        dr.line([tuple(g), tuple(wn)], fill=(255, 40, 40), width=3)
    img.save(OUT / f"lm_{n.split('.')[0]}.png")

print("fitted", json.dumps({f"{g}.{k}": round(float(v), 2) for ((g, k), _), v in zip(SHAPE, shape)}))
(HERE / "fitted.json").write_text(json.dumps(final, indent=1))
