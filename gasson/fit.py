"""Measures massing against a photo. Solves for the photo's camera, then reports silhouette overlap above a chosen line.
Only the part of the frame clear of trees and foreground is scored, and that region is stated in the output.
Run: uv run --no-project --with numpy --with scipy --with pillow python gasson/fit.py <photo> <out.png> <roi_bottom_fraction> <dark|bright>
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.optimize import minimize

from massing import build

photo_path, out_path, roi_frac, mode = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
SCALE_W = 500
img = ImageOps.exif_transpose(Image.open(photo_path)).convert("RGB")
img = img.resize((SCALE_W, round(img.height * SCALE_W / img.width)), Image.LANCZOS)
W, H = img.size
ROI = int(H * roi_frac)
rgb = np.asarray(img, float)
lum = rgb.mean(axis=2)
# The building is whatever differs from the sky: dark stone against a lit sky, or pale stone against a blue one.
if mode == "dark":
    target = lum < 95
else:
    target = (rgb[:, :, 2] - rgb[:, :, 0]) < 22
target = target.copy()
target[ROI:] = False

mesh = build()
V = np.array(mesh.verts)
F = [list(f) for f in mesh.faces]


def project(x):
    cx, cy, cz, yaw, pitch, f, roll = x
    a, b = np.radians(yaw), np.radians(pitch)
    fwd = np.array([np.sin(a) * np.cos(b), np.cos(a) * np.cos(b), np.sin(b)])
    right = np.array([np.cos(a), -np.sin(a), 0.0])
    up = np.cross(right, fwd)
    c = np.radians(roll)
    right, up = right * np.cos(c) + up * np.sin(c), up * np.cos(c) - right * np.sin(c)
    d = V - np.array([cx, cy, cz])
    z = d @ fwd
    u = W / 2 + f * W * (d @ right) / np.maximum(z, 0.1)
    v = H / 2 - f * W * (d @ up) / np.maximum(z, 0.1)
    return np.stack([u, v], 1)


def silhouette(x):
    pts = project(x)
    im = Image.new("1", (W, H))
    dr = ImageDraw.Draw(im)
    for face in F:
        dr.polygon([tuple(pts[i - 1]) for i in face], fill=1)
    a = np.asarray(im, bool).copy()
    a[ROI:] = False
    return a


def cost(x):
    s = silhouette(x)
    return 1 - (s & target).sum() / max(1, (s | target).sum())


best, best_cost = None, 9
for dist in (70, 95, 125):
    for cz in (6, 14, 24):
        for f in (0.75, 1.0, 1.3, 1.7):
            x0 = np.array([0.0, -dist, cz, 0.0, 12.0, f, 0.0])
            r = minimize(cost, x0, method="Nelder-Mead", options={"maxiter": 500, "xatol": 0.02, "fatol": 1e-4})
            if r.fun < best_cost:
                best, best_cost = r.x, r.fun
r = minimize(cost, best, method="Powell", options={"maxiter": 2000})
if r.fun < best_cost:
    best, best_cost = r.x, r.fun

s = silhouette(best)
over = rgb.copy()
over[s & ~target] = [255, 40, 40]
over[~s & target] = [40, 255, 90]
over[s & target] = over[s & target] * 0.45 + np.array([60, 170, 255]) * 0.55
Image.fromarray(over.astype("uint8")).save(out_path)
print(f"IoU {1 - best_cost:.3f}  scored top {roi_frac:.0%} of frame")
print("camera x,y,z {:.1f} {:.1f} {:.1f}  yaw {:.1f} pitch {:.1f} focal {:.2f} roll {:.1f}".format(*best))
print(f"model-only {(s & ~target).sum() / max(1, target.sum()):.3f}  photo-only {(~s & target).sum() / max(1, target.sum()):.3f} (share of photo silhouette)")
