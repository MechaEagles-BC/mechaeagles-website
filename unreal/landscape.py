"""Generates the Mission Control landscape: rolling meadow, far ranges, a grass field and distant trees. An invented place.
Coordinates match the rest of the project: metres, +Z up, the viewer on the -Y side, the platform at the origin in a shallow bowl.
Run: blender -b --factory-startup --python unreal/landscape.py"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from land_height import path_centre, fbm, height, smooth  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")
rng = np.random.default_rng(29)


def linear(c):
    return np.array([((v + 0.055) / 1.055) ** 2.4 if v > 0.04 else v / 12.92 for v in c])


MEADOW_A, MEADOW_B, MEADOW_C = linear((0.4, 0.55, 0.28)), linear((0.49, 0.6, 0.31)), linear((0.31, 0.47, 0.26))
DIRT = linear((0.6, 0.53, 0.39))
FAR = linear((0.47, 0.64, 0.56))


def path_mask(x, y):
    """A worn path that bends out of sight behind the right-hand grove, with a wandering edge."""
    centre = path_centre(y)
    width = 1.5 + fbm(x / 6, y / 6, 2) * 1.6
    mask = (1 - smooth(width * 0.75, width * 1.25, np.abs(x - centre))) * smooth(8, 12, y) * (1 - smooth(82, 96, y))
    return mask  # grass runs right up to the platform, which sets its own contact shadow


def colours(x, y, h):
    a = fbm(x / 40, y / 40, 3)[..., None]
    b = fbm(x / 7, y / 7, 2)[..., None]
    c = MEADOW_A * (1 - a) + MEADOW_B * a
    k = smooth(0.42, 0.68, b) * 0.6
    c = c * (1 - k) + MEADOW_C * k
    d = path_mask(x, y)[..., None]
    c = c * (1 - d) + DIRT * d
    far = smooth(220, 2200, np.hypot(x, y))[..., None]
    return c * (1 - far) + FAR * far


def write_glb(name, verts, faces, cols):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    me.loops.add(faces.size)
    me.loops.foreach_set("vertex_index", faces.astype(np.int32).ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set("loop_start", np.arange(0, faces.size, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", np.concatenate([cols, np.ones((len(cols), 1))], axis=1).ravel().astype(np.float32))
    me.color_attributes.active_color = attr
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"), export_format="GLB", export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True, export_vertex_color="ACTIVE")
    print("LAND", name, "verts", len(verts), "tris", len(faces))


def grid(x0, x1, y0, y1, nx, ny, drop=None):
    xs, ys = np.linspace(x0, x1, nx), np.linspace(y0, y1, ny)
    x, y = np.meshgrid(xs, ys)
    h = height(x, y)
    verts = np.stack([x, y, (h if drop is None else h - drop(x, y))], -1).reshape(-1, 3)
    i = np.arange(ny - 1)[:, None] * nx + np.arange(nx - 1)[None, :]
    faces = np.concatenate([np.stack([i, i + 1, i + nx + 1], -1).reshape(-1, 3), np.stack([i, i + nx + 1, i + nx], -1).reshape(-1, 3)])
    return verts, faces, colours(x, y, h).reshape(-1, 3)


os.makedirs(OUT, exist_ok=True)
NEAR = (-260.0, 260.0, -60.0, 460.0)
write_glb("land_near", *grid(*NEAR, 560, 560))
# the far sheet sits a little lower where the near sheet covers it
drop = lambda x, y: 4.0 * (1 - smooth(0, 30, np.maximum.reduce([NEAR[0] - x, x - NEAR[1], NEAR[2] - y, y - NEAR[3]])))
write_glb("land_far", *grid(-14000, 14000, -500, 16000, 620, 620, drop))

# ---------- distant trees: loose crowns of displaced spheres, seen only from far off ----------
def blob(cx, cy, cz, radius, stretch, verts, faces, cols, tint):
    golden = math.pi * (3 - math.sqrt(5))
    count = 90
    k = np.arange(count)
    z = 1 - 2 * (k + 0.5) / count
    rad = np.sqrt(1 - z * z)
    p = np.stack([np.cos(k * golden) * rad, np.sin(k * golden) * rad, z], -1)
    lump = 0.8 + 0.42 * rng.random((count, 1))
    pts = p * lump * radius * np.array([1, 1, stretch]) + np.array([cx, cy, cz])
    shade = (0.42 + 0.58 * (p[:, 2:3] * 0.5 + 0.5)) * tint
    base = sum(len(a) for a in verts)
    # triangles from the three nearest golden-spiral neighbours make a rough closed-looking crown
    idx = []
    for a in range(count):
        for step in (5, 8, 13):
            if a + step + 21 < count:
                idx.append((a, a + step, a + step + 8))
                idx.append((a, a + step + 8, a + 21 if step == 13 else a + 13))
    verts.append(pts)
    faces.append(np.array(idx) + base)
    cols.append(shade)


verts, faces, cols = [], [], []
LEAF = [linear((0.13, 0.25, 0.09)), linear((0.17, 0.29, 0.09)), linear((0.10, 0.21, 0.09))]
placed = 0
while placed < 150:
    px = (rng.random() * 2 - 1) * 330
    py = 180 + rng.random() * 200
    # groves that frame the valley, leaving the view behind the platform open
    if abs(px) < 42 + py * 0.25 or fbm(np.array([px / 90]), np.array([py / 90]), 3)[0] < 0.46:
        continue
    gz = float(height(np.array([px]), np.array([py]))[0])
    tall_ = 9 + rng.random() * 8
    tint = LEAF[int(rng.integers(3))]
    blob(px, py, gz + tall_ * 0.25, 0.5, 2.0, verts, faces, cols, np.array([0.05, 0.04, 0.03]))
    for k in range(7):
        a, d = rng.random() * math.tau, rng.random() * tall_ * 0.34
        blob(px + math.cos(a) * d, py + math.sin(a) * d, gz + tall_ * (0.58 + rng.random() * 0.32), tall_ * (0.2 + rng.random() * 0.14), 0.82, verts, faces, cols, tint)
    placed += 1
write_glb("trees", np.concatenate(verts), np.concatenate(faces), np.concatenate(cols))
print("LANDSCAPE OK")
