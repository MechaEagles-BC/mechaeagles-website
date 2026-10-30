"""Gasson Hall tower and gable window as parametric CAD, in metres to match the massing.
Main positions come from fitted.json (solved from photos). Small details such as mullion sizes, frieze panels and crockets
are read by eye from the photos and are not measured. Faces the photos don't show are assumed to repeat the visible ones,
except the clock and the cross, which appear only on the front in these photos.
Run: cadgen +0.8.3 run gasson/tower.py
"""
import json
import math
import sys
from pathlib import Path

import build123d as bd
from cadgen import model

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "cad"))
from foundation import write_obj  # noqa: E402

P = json.loads((HERE / "fitted.json").read_text())
T, U, BF, CK = P["tower"], P["turret"], P["belfry"], P["clock"]
HW, TOP, TIP = T["half_w"], T["top"], P["tip"]
SILL, APEX, BX = BF["sill"], BF["apex"], BF["x"]
CLOCK_Z = CK["z"]
IX = HW - U["inset"]


def v(*p):
    return bd.Vector(*p)


def prism_xz(points, y0, depth):
    """Extrude an (x, z) outline along +Y from y0."""
    wire = bd.Wire.make_polygon([v(x, y0, z) for x, z in points], close=True)
    return bd.extrude(bd.Face(wire), depth, dir=(0, 1, 0))


def arch_outline(cx, w, sill, apex, steps=7):
    """A pointed Gothic arch, each side an arc struck from the opposite spring point."""
    rise = min(w * math.sqrt(3) / 2, apex - sill)
    spring = apex - rise
    r = (w * w / 4 + rise * rise) / w
    left = [(cx + w / 2 - r * math.cos(a), spring + r * math.sin(a)) for a in [math.asin(rise / r) * i / steps for i in range(steps + 1)]]
    right = [(2 * cx - x, z) for x, z in reversed(left[:-1])]
    return [(cx - w / 2, sill), *left, *right, (cx + w / 2, sill)]


def arch(cx, w, sill, apex, y0, depth):
    return prism_xz(arch_outline(cx, w, sill, apex), y0, depth)


def box(x0, x1, y0, y1, z0, z1):
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(x1 - x0, y1 - y0, z1 - z0)


def disc_y(cx, cz, r, y0, depth):
    return bd.Pos(cx, y0 + depth / 2, cz) * bd.Rotation(90, 0, 0) * bd.Cylinder(r, depth)


def octagon_prism(cx, cy, r, z0, z1):
    pts = [v(cx + r * math.cos(i * math.tau / 8 + math.pi / 8), cy + r * math.sin(i * math.tau / 8 + math.pi / 8), z0) for i in range(8)]
    return bd.extrude(bd.Face(bd.Wire.make_polygon(pts, close=True)), z1 - z0)


def octagon_spire(cx, cy, r, z0, z1, r_top=0.08):
    """Tapered octagonal spire, cut off at a small flat for a finial."""
    pts = [v(cx + r * math.cos(i * math.tau / 8 + math.pi / 8), cy + r * math.sin(i * math.tau / 8 + math.pi / 8), z0) for i in range(8)]
    flat = (r - r_top) * math.cos(math.pi / 8)
    return bd.extrude(bd.Face(bd.Wire.make_polygon(pts, close=True)), z1 - z0, taper=math.degrees(math.atan2(flat, z1 - z0)))


# ---------- one face of the tower. Local frame: wall plane at y=0, +y into the wall, -y outward. ----------
def face_cuts(front):
    cuts = []
    for s in (-1, 1):
        cuts.append(arch(s * BX, 3.55, SILL - 0.1, APEX + 0.5, -0.01, 0.46))  # recessed surround
        cuts.append(arch(s * BX, 2.5, SILL + 0.2, APEX - 0.1, 0.4, 1.3))  # the open belfry
        cuts.append(arch(s * (HW - 2.35), 0.55, SILL + 0.6, APEX - 0.9, -0.01, 0.18))  # blind lancets beside it
    for i in range(7):  # frieze of narrow blind panels under the cornice, in two tiers
        cx = (i - 3) * 1.22
        cuts.append(arch(cx, 0.92, APEX + 1.0, APEX + 2.35, -0.01, 0.14))
        cuts.append(arch(cx, 0.92, APEX + 2.5, TOP - 0.72, -0.01, 0.14))
    if front:
        cuts.append(box(-3.45, 3.45, -0.01, 0.13, CLOCK_Z - 3.0, CLOCK_Z + 3.0))
        for s in (-1, 1):
            cuts.append(box(s * 3.02 - 0.27, s * 3.02 + 0.27, 0.1, 0.5, CLOCK_Z - 2.2, CLOCK_Z + 2.2))
    else:
        for s in (-1, 1):
            cuts.append(arch(s * 2.4, 0.62, CLOCK_Z - 3.6, CLOCK_Z + 3.0, -0.01, 0.22))  # tall lancets on the side faces
    return cuts


def belfry_tracery(cx):
    """Mullion, transoms and head tracery inside one belfry opening."""
    w, sill, apex = 2.5, SILL + 0.2, APEX - 0.1
    rise = w * math.sqrt(3) / 2
    spring = apex - rise
    y0, y1 = 0.42, 0.68
    parts = [box(cx - 0.11, cx + 0.11, y0, y1, sill, spring + 0.5)]
    for z in (sill + (spring - sill) * 0.36, sill + (spring - sill) * 0.72):
        parts.append(box(cx - w / 2, cx + w / 2, y0, y1, z - 0.07, z + 0.07))
    for s in (-1, 1):  # two small arches in the head, under a rosette
        outer = arch(cx + s * 0.61, 1.08, spring - 0.5, spring + 0.72, y0, y1 - y0)
        inner = arch(cx + s * 0.61, 0.86, spring - 0.55, spring + 0.54, y0 - 0.01, y1 - y0 + 0.02)
        parts.append(outer - inner)
    rz = spring + 1.14
    parts.append(disc_y(cx, rz, 0.41, y0, y1 - y0) - disc_y(cx, rz, 0.30, y0 - 0.01, y1 - y0 + 0.02))
    for i in range(4):  # foiled rosette spokes
        parts.append(bd.Pos(cx, (y0 + y1) / 2, rz) * bd.Rotation(0, i * 45, 0) * bd.Box(0.64, y1 - y0, 0.05))
    # sloped outer arch ring that frames the opening
    ring = arch(cx, 2.5, sill, apex, y0, y1 - y0) - arch(cx, 2.26, sill - 0.05, apex - 0.17, y0 - 0.01, y1 - y0 + 0.02)
    parts.append(ring)
    return parts


def face_adds(front):
    adds = []
    for s in (-1, 1):
        cx = s * BX
        adds += belfry_tracery(cx)
        hood = arch(cx, 3.95, SILL - 0.1, APEX + 0.82, -0.1, 0.13) - arch(cx, 3.55, SILL - 0.3, APEX + 0.5, -0.12, 0.17)
        adds.append(hood)
        adds.append(box(cx - 1.95, cx + 1.95, -0.2, 0.44, SILL - 0.28, SILL - 0.08))  # sill
        # corner buttress with weathered set-offs, then a gablet where it meets the frieze
        bx = s * (HW - 0.85)
        pts = [(0.0, 23.5), (-0.62, 23.5), (-0.62, SILL - 1.5), (-0.38, SILL - 0.9), (-0.38, APEX + 0.4), (0.0, APEX + 1.1)]
        wire = bd.Wire.make_polygon([v(bx - 0.85, y, z) for y, z in pts], close=True)
        adds.append(bd.extrude(bd.Face(wire), 1.7, dir=(1, 0, 0)))
        for gx in (bx - 0.43, bx + 0.43):
            adds.append(prism_xz([(gx - 0.42, APEX + 0.3), (gx + 0.42, APEX + 0.3), (gx, APEX + 2.55)], -0.42, 0.42))
            adds.append(box(gx - 0.05, gx + 0.05, -0.28, -0.14, APEX + 2.45, APEX + 3.05))
    for i in range(22):  # corbel table under the cornice
        cx = -HW + 0.6 + i * (2 * HW - 1.2) / 21
        adds.append(box(cx - 0.11, cx + 0.11, -0.18, 0.0, TOP - 0.62, TOP - 0.34))
    # parapet and battlement
    pw = HW - U["inset"] - 1.35
    adds.append(box(-pw, pw, 0.0, 0.5, TOP, TOP + 1.05))
    for i, cx in enumerate((-3.2, -1.6, 0.0, 1.6, 3.2)):
        h = 2.75 if i == 2 else 2.1
        adds.append(box(cx - 0.52, cx + 0.52, 0.0, 0.5, TOP + 0.4, TOP + h))
        adds.append(box(cx - 0.58, cx + 0.58, -0.04, 0.54, TOP + h, TOP + h + 0.12))
        adds.append(arch(cx, 0.46, TOP + 0.55, TOP + h - 0.3, -0.03, 0.04))
    if front:
        z = CLOCK_Z
        adds.append(disc_y(0, z, 2.35, 0.09, 0.05))
        adds.append(disc_y(0, z, 2.76, -0.12, 0.26) - disc_y(0, z, 2.5, -0.13, 0.3))
        for i in range(12):  # hour blocks
            a = i * math.tau / 12
            adds.append(bd.Pos(1.98 * math.sin(a), 0.0, z + 1.98 * math.cos(a)) * bd.Rotation(0, math.degrees(a), 0) * bd.Box(0.3, 0.12, 0.82))
        for length, width, deg in ((1.45, 0.14, 62), (2.1, 0.1, 228)):  # hands, at an arbitrary time
            a = math.radians(deg)
            adds.append(bd.Pos(length / 2 * math.sin(a), -0.08, z + length / 2 * math.cos(a)) * bd.Rotation(0, deg, 0) * bd.Box(width, 0.05, length))
        adds.append(disc_y(0, z, 0.17, -0.12, 0.12))
        for s in (-1, 1):
            adds.append(box(s * 3.45 - 0.09, s * 3.45 + 0.09, -0.06, 0.1, z - 3.05, z + 3.05))
        for z0 in (z - 3.05, z + 3.05):
            adds.append(box(-3.54, 3.54, -0.06, 0.1, z0 - 0.09, z0 + 0.09))
        # the cross stands on the front parapet in every photo that shows it
        cz0, cz1 = TOP + 2.84, P["cross"]["z1"]
        adds.append(box(-0.13, 0.13, 0.12, 0.38, cz0, cz1))
        adds.append(box(-0.55, 0.55, 0.12, 0.38, cz1 - 1.2, cz1 - 0.92))
        for sx, sz in ((-0.55, cz1 - 1.06), (0.55, cz1 - 1.06), (0, cz1)):  # small pattee ends
            adds.append(bd.Pos(sx, 0.25, sz) * bd.Box(0.3, 0.26, 0.3))
    return adds


# ---------- corner pinnacles ----------
def pinnacle(cx, cy):
    parts = []
    r = 1.32
    shoulder = TIP - 6.3
    parts.append(octagon_prism(cx, cy, r, TOP - 3.3, shoulder))
    for z, grow in ((TOP - 0.45, 0.1), (TOP + 3.2, 0.07), (shoulder, 0.08)):
        parts.append(octagon_prism(cx, cy, r + grow, z - 0.09, z + 0.09))
    for i in range(8):  # lancet panels and gablets around the shaft
        a = i * math.tau / 8
        d = r * math.cos(math.pi / 8)
        place = bd.Pos(cx + d * math.cos(a), cy + d * math.sin(a), 0) * bd.Rotation(0, 0, math.degrees(a) + 90)
        w = 2 * r * math.sin(math.pi / 8) * 0.92
        parts.append(place * prism_xz([(-w / 2, shoulder - 0.05), (w / 2, shoulder - 0.05), (0, shoulder + 2.1)], -0.06, 0.12))
        parts.append(place * (arch(0, w * 0.72, TOP + 3.5, shoulder - 0.5, -0.03, 0.05)))
    spire_base = shoulder + 0.1
    parts.append(octagon_spire(cx, cy, r * 0.93, spire_base, TIP - 0.55))
    for k in range(6):  # crockets climbing each spire angle
        z = spire_base + 0.7 + k * 0.78
        rr = r * 0.93 * (1 - (z - spire_base) / (TIP - 0.55 - spire_base)) + 0.09
        for i in range(8):
            a = i * math.tau / 8 + math.pi / 8
            parts.append(bd.Pos(cx + rr * math.cos(a), cy + rr * math.sin(a), z) * bd.Rotation(0, 0, math.degrees(a)) * bd.Box(0.14, 0.09, 0.2))
    parts.append(bd.Pos(cx, cy, TIP - 0.45) * bd.Sphere(0.17))
    parts.append(box(cx - 0.05, cx + 0.05, cy - 0.05, cy + 0.05, TIP - 0.5, TIP))
    parts.append(box(cx - 0.18, cx + 0.18, cy - 0.04, cy + 0.04, TIP - 0.3, TIP - 0.22))
    # small attendant pinnacles clustered on the outer corners
    sx, sy = (1 if cx > 0 else -1), (1 if cy > 0 else -1)
    for ox, oy, top in ((sx * (r + 0.12), sy * 0.25, TOP + 4.6), (sx * 0.25, sy * (r + 0.12), TOP + 4.6), (sx * (r - 0.1) * 0.9, sy * (r - 0.1) * 0.9, TOP + 3.0)):
        x, y = cx + ox, cy + oy
        parts.append(octagon_prism(x, y, 0.27, TOP - 3.4, top - 1.9))
        parts.append(octagon_prism(x, y, 0.32, top - 2.0, top - 1.88))
        parts.append(octagon_spire(x, y, 0.26, top - 1.9, top))
    return parts


def tower_body():
    shaft = box(-HW, HW, -HW, HW, 0, TOP)
    pieces = []
    for side in range(4):
        front = side == 0
        place = bd.Rotation(0, 0, side * 90) * bd.Pos(0, -HW, 0)
        for c in face_cuts(front):
            shaft = shaft - (place * c)
        pieces += [place * a for a in face_adds(front)]
    pieces.append(box(-HW - 0.3, HW + 0.3, -HW - 0.3, HW + 0.3, TOP - 0.34, TOP))  # cornice
    pieces.append(box(-HW - 0.12, HW + 0.12, -HW - 0.12, HW + 0.12, APEX + 0.72, APEX + 0.92))
    pieces.append(box(-HW - 0.12, HW + 0.12, -HW - 0.12, HW + 0.12, SILL - 1.0, SILL - 0.8))
    pieces.append(box(-HW - 0.22, HW + 0.22, -HW - 0.22, HW + 0.22, 0, 1.1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            pieces += pinnacle(sx * IX, sy * IX)
    world = bd.Pos(0, T["y0"] + HW, 0)
    return bd.Compound(children=[world * s for s in [shaft, *pieces]])


def gable_bay_body():
    """The gabled bay in front of the tower, with its tall traceried window."""
    b = P["bay"]
    hw, y0, y1 = 3.95, b["y0"], b["y0"] + 6.5  # narrower than the massing estimate, as the quad photo and postcard show
    wall, peak = b["wall"], b["peak"]
    wire = bd.Wire.make_polygon([v(-hw, y0, 0), v(hw, y0, 0), v(hw, y0, wall), v(0, y0, peak), v(-hw, y0, wall)], close=True)
    body = bd.extrude(bd.Face(wire), y1 - y0, dir=(0, 1, 0))
    sill, apex, w = 16.4, min(peak - 2.6, 23.2), 3.5
    body = body - arch(0, w + 0.5, sill - 0.1, apex + 0.3, y0 - 0.01, 0.34) - arch(0, w, sill, apex, y0 + 0.28, 0.9)
    parts = [body]
    t0, t1 = y0 + 0.3, y0 + 0.52
    rise = w * math.sqrt(3) / 2
    spring = apex - rise
    for x in (-w / 4, 0, w / 4):
        parts.append(box(x - 0.07, x + 0.07, t0, t1, sill, spring + 0.5))
    for z in (sill + (spring - sill) * 0.34, sill + (spring - sill) * 0.68):
        parts.append(box(-w / 2, w / 2, t0, t1, z - 0.05, z + 0.05))
    for s in (-1, 1):
        parts.append(arch(s * w / 4, w / 2 - 0.08, spring - 0.3, spring + 1.55, t0, t1 - t0) - arch(s * w / 4, w / 2 - 0.2, spring - 0.35, spring + 1.42, t0 - 0.01, t1 - t0 + 0.02))
        for x in (s * w / 8, s * 3 * w / 8):
            parts.append(arch(x, w / 4 - 0.05, spring - 0.1, spring + 0.62, t0, t1 - t0) - arch(x, w / 4 - 0.15, spring - 0.15, spring + 0.5, t0 - 0.01, t1 - t0 + 0.02))
    rz = spring + 2.55
    parts.append(disc_y(0, rz, 0.5, t0, t1 - t0) - disc_y(0, rz, 0.41, t0 - 0.01, t1 - t0 + 0.02))
    parts.append(arch(0, w, sill, apex, t0, t1 - t0) - arch(0, w - 0.22, sill - 0.05, apex - 0.16, t0 - 0.01, t1 - t0 + 0.02))
    parts.append(arch(0, w + 0.9, sill - 0.1, apex + 0.62, y0 - 0.1, 0.13) - arch(0, w + 0.5, sill - 0.3, apex + 0.3, y0 - 0.12, 0.17))
    parts.append(box(-w / 2 - 0.45, w / 2 + 0.45, y0 - 0.2, y0 + 0.3, sill - 0.3, sill - 0.08))
    # low stepped shoulders either side of the gable, and the small row of windows beneath its window
    for s in (-1, 1):
        parts.append(box(*sorted((s * hw, s * (hw + 1.35))), y0 + 0.4, y0 + 1.1, wall - 1.6, wall + 0.5))
        parts.append(box(s * (hw + 0.45) - 0.42, s * (hw + 0.45) + 0.42, y0 + 0.4, y0 + 1.1, wall + 0.5, wall + 1.3))
    parts = [parts[0] - box(-2.0, 2.0, y0 - 0.01, y0 + 0.24, 14.1, 15.9), *parts[1:]]
    for x in (-1.0, 0.0, 1.0):
        parts.append(box(x - 0.05, x + 0.05, y0 + 0.1, y0 + 0.24, 14.1, 15.9))
    parts.append(box(-2.14, 2.14, y0 - 0.1, y0 + 0.03, 15.9, 16.05))
    parts.append(box(-2.2, 2.2, y0 - 0.14, y0 + 0.03, 13.86, 14.1))
    # coping up each side of the gable
    for s in (-1, 1):
        run, fall = hw, peak - wall
        length = math.hypot(run, fall)
        slope = math.degrees(math.atan2(fall, run))
        parts.append(bd.Pos(s * hw / 2, y0 - 0.02, (wall + peak) / 2 + 0.12) * bd.Rotation(0, s * slope, 0) * bd.Box(length + 0.4, 0.5, 0.26))
    return bd.Compound(children=parts)


@model
def gasson_tower():
    shape = tower_body()
    shape.label = "gasson_tower"
    return shape


@model
def gasson_bay():
    shape = gable_bay_body()
    shape.label = "gasson_bay"
    return shape


if __name__ == "__main__":
    out = HERE / "parts"
    out.mkdir(exist_ok=True)
    # the shared writer expects millimetres
    for fn, name in ((gasson_tower, "tower"), (gasson_bay, "bay")):
        doc = fn()
        scaled = doc.shape.scale(1000)
        print(name, "tris", write_obj(scaled, out / f"{name}.obj", tolerance=2.0, angular=0.3))
