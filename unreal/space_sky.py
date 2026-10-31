"""Paints the space backdrop in film coordinates, and the reflection map the live platform uses. All invented.
The sky stays in pale teal and cream, because amber, blue, red and violet belong to the teams.
Run: uv run --no-project --with numpy --with pillow python -I unreal/space_sky.py"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(globals().get("__file__", "space_sky.py")).resolve().parent
sys.path.insert(0, str(HERE))
from land_height import fbm, smooth  # noqa: E402
from space_height import SKY_U, SKY_V  # noqa: E402

rng = np.random.default_rng(83)
H = 4096
W = int(H * (SKY_U[1] - SKY_U[0]) / (SKY_V[1] - SKY_V[0]))
PER_UNIT = H / (SKY_V[1] - SKY_V[0])
# Where the planet sits: up and to the left, small and mostly in shadow, so it adds depth and never competes with the platform.
PLANET = (-0.39, 0.178, 0.104)
SUN = np.array([-0.74, 0.5, 0.28])
SUN = SUN / np.linalg.norm(SUN)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c < 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


v, u = np.meshgrid(np.linspace(SKY_V[1], SKY_V[0], H), np.linspace(SKY_U[0], SKY_U[1], W), indexing="ij")

# ---------- the galaxy: one band from low on the right to high on the left of the film, with dust through its core ----------
ANGLE = np.radians(24)
along = u * np.cos(ANGLE) + (v - 0.34) * np.sin(ANGLE)
across = -u * np.sin(ANGLE) + (v - 0.34) * np.cos(ANGLE)
warp = (fbm(u * 3.1 + 20, v * 3.1, 5) - 0.5) * 0.24
d = (across + warp) / 0.25
band = np.exp(-d * d)
cloud = smooth(0.32, 0.78, fbm(u * 7 + 4, v * 7 + 9, 6, 0.55))
core = np.exp(-(((along - 0.26) / 0.62) ** 2)) * np.exp(-((d / 0.5) ** 2))
dust = smooth(0.46, 0.72, fbm(u * 15 + 70, v * 15, 5, 0.6)) * np.exp(-((d / 0.42) ** 2))
glow = band * (0.28 + cloud * 0.72)
sky = np.zeros((H, W, 3))
sky += np.array([0.0035, 0.0065, 0.011])
sky += glow[..., None] * np.array([0.018, 0.058, 0.07]) * 1.1
sky += core[..., None] * (0.3 + cloud[..., None] * 0.7) * np.array([0.13, 0.115, 0.082]) * 0.95
sky *= (1 - dust[..., None] * 0.68)
far = smooth(0.45, 0.8, fbm(u * 2 + 90, v * 2 + 7, 4))
sky += far[..., None] * np.array([0.004, 0.0085, 0.009])

# ---------- stars: many faint, a few bright, thicker in the band ----------
def splat(n, sigma, lo, hi, density=None):
    count = 0
    r = int(np.ceil(sigma * 3))
    gx, gy = np.meshgrid(np.arange(-r, r + 1), np.arange(-r, r + 1))
    shape = np.exp(-(gx * gx + gy * gy) / (2 * sigma * sigma))
    while count < n:
        x, y = int(rng.integers(r, W - r)), int(rng.integers(r, H - r))
        if density is not None and rng.random() > density[y, x]:
            continue
        warm = rng.random()
        tint = np.array([1.0, 0.86, 0.68]) if warm < 0.18 else np.array([0.76, 0.9, 1.0]) if warm < 0.42 else np.array([1.0, 1.0, 1.0])
        sky[y - r:y + r + 1, x - r:x + r + 1] += shape[..., None] * tint * (lo + (hi - lo) * rng.random() ** 3)
        count += 1


density = 0.3 + band * (1 - dust * 0.85) * 0.7
splat(26000, 0.75, 0.018, 0.16, density)
splat(1500, 1.05, 0.06, 0.42, density)
splat(90, 1.6, 0.4, 1.2)

# ---------- the planet: pale bands, lit from the upper left, with a thin ring and its shadow ----------
cx, cy, R = PLANET
px, py = (u - cx) / R, (v - cy) / R
# the ring plane is tipped toward the viewer and turned, as seen from the moon
TILT = np.radians(-17)
rx = px * np.cos(TILT) - py * np.sin(TILT)
ry = (px * np.sin(TILT) + py * np.cos(TILT))
rr = np.hypot(rx, ry / 0.2)
inside = px * px + py * py < 1
nz = np.sqrt(np.clip(1 - px * px - py * py, 0, 1))
light = np.clip(px * SUN[0] + py * SUN[1] + nz * SUN[2], 0, 1)
lat = np.where(inside, py * np.cos(TILT) + px * np.sin(TILT), 0)
bands = fbm(lat * 13 + (fbm(px * 2.4 + 8, py * 2.4, 3) - 0.5) * 0.45 + 40, np.full_like(lat, 3.3), 4)
storm = smooth(0.58, 0.74, fbm(px * 6 + 4, lat * 15 + 5, 4))
base = (np.array([0.62, 0.66, 0.66]) * (1 - bands[..., None]) + np.array([0.86, 0.8, 0.68]) * bands[..., None])
base = base * (1 - storm[..., None] * 0.22)
planet = base * (light[..., None] ** 0.9) * 0.72
limb = np.exp(-(((np.hypot(px, py) - 1) / 0.03) ** 2)) * np.clip(px * SUN[0] + py * SUN[1] + 0.32, 0, 1)
sky = np.where(inside[..., None], planet + np.array([0.003, 0.004, 0.006]), sky)
sky += limb[..., None] * np.array([0.33, 0.47, 0.5]) * 0.8
ring = (smooth(1.32, 1.4, rr) * (1 - smooth(1.56, 1.62, rr)) * 0.55 + smooth(1.66, 1.7, rr) * (1 - smooth(1.98, 2.08, rr)) * 0.3)
ring = ring * (0.65 + fbm(rr * 45, np.full_like(rr, 7.7), 3) * 0.7)
shadowed = (ry < 0) | ~inside  # the near half of the ring crosses in front of the planet
ring = ring * shadowed
sun_side = np.clip(0.5 + rx * 0.55, 0.12, 1)
sky = sky * (1 - ring[..., None] * 0.75) + ring[..., None] * sun_side[..., None] * np.array([0.26, 0.26, 0.235])

noise = (rng.random((H, W, 3)) - 0.5) / 255 * 1.6  # dither, because a dark gradient bands in 8 bits
out = np.clip(to_srgb(sky) + noise, 0, 1)
(HERE / "parts").mkdir(exist_ok=True)
Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(HERE / "parts" / "T_SpaceSky.png")

# ---------- the reflection map: lit dust below, the galaxy overhead, and a soft pale patch where the planet sits ----------
ENV = HERE.parent / "public" / "env" / "space"
ENV.mkdir(parents=True, exist_ok=True)
SIZE = 256
FACES = {
    "px": lambda a, b: (np.ones_like(a), -b, -a),
    "nx": lambda a, b: (-np.ones_like(a), -b, a),
    "py": lambda a, b: (a, np.ones_like(a), b),
    "ny": lambda a, b: (a, -np.ones_like(a), -b),
    "pz": lambda a, b: (a, -b, np.ones_like(a)),
    "nz": lambda a, b: (-a, -b, -np.ones_like(a)),
}
LOCAL = np.random.default_rng(5)
for face, fn in FACES.items():
    a, b = np.meshgrid(np.linspace(-1, 1, SIZE), np.linspace(-1, 1, SIZE))
    x, y, z = fn(a, b)
    n = np.sqrt(x * x + y * y + z * z)
    x, y, z = x / n, y / n, z / n
    ground = smooth(0.02, -0.14, y)[..., None]
    lit = np.array([0.2, 0.2, 0.2]) * (0.72 + 0.28 * smooth(-1, 0.1, -x * 0.5 + z * 0.8))[..., None]
    t = (x * np.sin(ANGLE) - y * np.cos(ANGLE) + 0.1)
    upper = np.array([0.024, 0.026, 0.03]) + np.exp(-((t / 0.32) ** 2))[..., None] * np.array([0.09, 0.095, 0.105])
    # the planet, behind the viewer's left as a mirror sees it, keeps the metal from going flat
    patch = np.exp(-(((x + 0.62) ** 2 + (y - 0.42) ** 2 + (z - 0.66) ** 2) / 0.38))[..., None] * np.array([0.84, 0.85, 0.88])
    behind = np.exp(-(((x - 0.72) ** 2 + (y - 0.26) ** 2 + (z + 0.62) ** 2) / 0.22))[..., None] * np.array([0.17, 0.18, 0.2])
    img = upper * (1 - ground) + lit * ground + patch * (1 - ground) + behind * (1 - ground)
    img = np.clip(to_srgb(img) + (LOCAL.random((SIZE, SIZE, 3)) - 0.5) / 255, 0, 1)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(ENV / (face + ".webp"), quality=88)
print("SKY OK", W, H)
