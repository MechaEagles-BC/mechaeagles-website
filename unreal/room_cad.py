"""The Mission Control room as CAD. Metres in the code, +Z up, the viewer on the -Y side. Gothic-inspired and invented: not a real space.
Parts are split by material. Proxies stand in for the live platform and panels, so Unreal bakes their reflections and floor light.
Run: cadgen +0.8.3 run unreal/room_cad.py"""
import math
import sys
from pathlib import Path

import build123d as bd
from cadgen import model

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "cad"))
from foundation import write_obj  # noqa: E402

OUT = HERE / "parts"
HALF_W, BACK_Y, FRONT_Y = 25.0, 17.0, 60.0  # the viewer stands at y = -28
BAY = 10.0
RISE = 26.0  # wall height, far above the frame so nothing shows the top
TEAM_ANGLES = [-150, 150, 30, -30]
PANEL_RADIUS, PANEL_SCALE = 10.3, 0.8


def v(*p):
    return bd.Vector(*p)


def box(x0, x1, y0, y1, z0, z1):
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(x1 - x0, y1 - y0, z1 - z0)


def arch_pts(cx, w, sill, apex, steps=8):
    rise = min(w * math.sqrt(3) / 2, apex - sill)
    spring = apex - rise
    r = (w * w / 4 + rise * rise) / w
    left = [(cx + w / 2 - r * math.cos(a), spring + r * math.sin(a)) for a in [math.asin(rise / r) * i / steps for i in range(steps + 1)]]
    right = [(2 * cx - x, z) for x, z in reversed(left[:-1])]
    return [(cx - w / 2, sill), *left, *right, (cx + w / 2, sill)]


def arch_prism(cx, w, sill, apex, y0, depth):
    wire = bd.Wire.make_polygon([v(x, y0, z) for x, z in arch_pts(cx, w, sill, apex)], close=True)
    return bd.extrude(bd.Face(wire), depth, dir=(0, 1, 0))


def to_side(part, sign):
    """Carries a back-wall detail, built facing -Y at y=0, onto a side wall facing the room."""
    return bd.Pos(sign * HALF_W, 0, 0) * bd.Rotation(0, 0, 90 * sign) * part


def window_bay(cx, w=6.2, sill=1.0, apex=9.0):
    """A tall lancet window at wall plane y=0, inward along +y from the room (-y)."""
    frame = []
    glass = [arch_prism(cx, w, sill, apex, 0.55, 0.06)]
    n = 4
    rise = w * math.sqrt(3) / 2
    spring = apex - rise
    for i in range(1, n):
        x = cx - w / 2 + i * w / n
        frame.append(box(x - 0.07, x + 0.07, 0.3, 0.55, sill, spring))
    for z in [sill + (spring - sill) * k / 2 for k in range(1, 2)]:
        frame.append(box(cx - w / 2, cx + w / 2, 0.36, 0.5, z - 0.04, z + 0.04))
    for s in (-1, 1):  # two sub-arches in the head
        outer = arch_prism(cx + s * w / 4, w / 2 - 0.1, spring - 0.5, spring + rise * 0.72, 0.3, 0.25)
        inner = arch_prism(cx + s * w / 4, w / 2 - 0.36, spring - 0.6, spring + rise * 0.72 - 0.26, 0.28, 0.3)
        frame.append(outer - inner)
    ring = arch_prism(cx, w, sill, apex, 0.3, 0.25) - arch_prism(cx, w - 0.34, sill - 0.1, apex - 0.28, 0.28, 0.3)
    frame.append(ring)
    frame.append(box(cx - w / 2 - 0.3, cx + w / 2 + 0.3, -0.25, 0.3, sill - 0.3, sill))
    hood = arch_prism(cx, w + 0.9, sill, apex + 0.55, -0.12, 0.13) - arch_prism(cx, w + 0.4, sill - 0.1, apex + 0.22, -0.14, 0.18)
    frame.append(hood)
    return frame, glass


def pier(x):
    """A clustered pier against the wall, with weathered set-offs at its base."""
    parts = [box(x - 0.95, x + 0.95, -0.85, 0.05, 0, 0.9), box(x - 0.75, x + 0.75, -0.65, 0.05, 0.9, 1.4)]
    for dx, r in ((0, 0.4), (-0.5, 0.2), (0.5, 0.2)):
        parts.append(bd.Pos(x + dx, -0.42, RISE / 2 + 0.7) * bd.Cylinder(r, RISE))
    return parts


def wall_set():
    """One wall facing -y at y=0 from u0 to u1, with window cuts."""
    wall = box(-HALF_W, HALF_W, 0, 1.0, 0, RISE)
    trim, glass = [], []
    xs = [(-20.0, -10.0, 0.0, 10.0, 20.0)][0]
    for cx in xs:
        wall = wall - arch_prism(cx, 6.2, 1.0, 9.0, -0.01, 1.1)
        f, g = window_bay(cx)
        trim += f
        glass += g
    for x in (-25.0, -15.0, -5.0, 5.0, 15.0, 25.0):
        trim += pier(x)
    trim.append(box(-HALF_W, HALF_W, -0.16, 0.05, 0.62, 0.8))  # string course
    trim.append(box(-HALF_W, HALF_W, -0.3, 0.05, 10.0, 10.5))  # upper cornice
    trim.append(box(-HALF_W, HALF_W, -0.3, 0.05, 0, 0.5))  # plinth course
    return wall, trim, glass


def side_wall_set():
    """A side wall's bays, built along x from 0 outward in local space and laid along Y."""
    depth = BACK_Y + 40
    wall = box(0, 1.0, -depth + BACK_Y, BACK_Y, 0, RISE)
    trim, glass = [], []
    for k in range(5):
        y = BACK_Y - 5 - k * BAY
        wall = wall - bd.Pos(0, y, 0) * bd.Rotation(0, 0, -90) * arch_prism(0, 6.2, 1.0, 9.0, -0.01, 1.1)
        f, g = window_bay(0)
        trim += [bd.Pos(0, y, 0) * bd.Rotation(0, 0, -90) * p for p in f]
        glass += [bd.Pos(0, y, 0) * bd.Rotation(0, 0, -90) * p for p in g]
    for k in range(6):
        y = BACK_Y - k * BAY
        trim += [bd.Pos(0, y, 0) * bd.Rotation(0, 0, -90) * p for p in pier(0)]
    trim.append(box(-0.16, 0.05, -depth + BACK_Y, BACK_Y, 0.62, 0.8))
    trim.append(box(-0.3, 0.05, -depth + BACK_Y, BACK_Y, 10.0, 10.5))
    trim.append(box(-0.3, 0.05, -depth + BACK_Y, BACK_Y, 0, 0.5))
    return wall, trim, glass


def room_stone():
    wall, _, _ = wall_set()
    parts = [bd.Pos(0, BACK_Y, 0) * wall]
    side, _, _ = side_wall_set()
    parts += [bd.Pos(HALF_W, 0, 0) * side, bd.Pos(-HALF_W, 0, 0) * bd.mirror(side, about=bd.Plane.YZ)]
    parts.append(box(-HALF_W, HALF_W, -40, BACK_Y, RISE, RISE + 1))  # roof, so nothing leaks sky
    parts.append(box(-HALF_W, HALF_W, -41, -40, 0, RISE))  # the wall behind the viewer
    return bd.Compound(children=parts)


def room_trim():
    _, t, _ = wall_set()
    parts = [bd.Pos(0, BACK_Y, 0) * p for p in t]
    _, st, _ = side_wall_set()
    parts += [bd.Pos(HALF_W, 0, 0) * p for p in st]
    parts += [bd.Pos(-HALF_W, 0, 0) * bd.mirror(p, about=bd.Plane.YZ) for p in st]
    return bd.Compound(children=parts)


def room_glass():
    _, _, g = wall_set()
    parts = [bd.Pos(0, BACK_Y, 0) * p for p in g]
    _, _, sg = side_wall_set()
    parts += [bd.Pos(HALF_W, 0, 0) * p for p in sg]
    parts += [bd.Pos(-HALF_W, 0, 0) * bd.mirror(p, about=bd.Plane.YZ) for p in sg]
    return bd.Compound(children=parts)


def floor_slabs():
    """Slabs with a hairline gap, so the polished floor has structure."""
    parts = []
    size = 5.0
    for i in range(-5, 5):
        for j in range(-8, 4):
            x, y = i * size, j * size
            parts.append(box(x + 0.012, x + size - 0.012, y + 0.012, y + size - 0.012, -0.2, 0.0))
    return bd.Compound(children=parts)


def line(a, b, width=0.035):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    return bd.Pos((ax + bx) / 2, (ay + by) / 2, 0.006) * bd.Rotation(0, 0, math.degrees(math.atan2(dy, dx))) * bd.Box(length, width, 0.012)


def circuits():
    """Thin inlaid paths: from each panel out to the walls, with octilinear jogs. Colours are set per team in Unreal."""
    teams = []
    for a in TEAM_ANGLES:
        rad = math.radians(a)
        # same convention as the site: x = cos, viewer at -y in CAD means y = sin with the sign kept
        px, py = math.cos(rad) * PANEL_RADIUS, math.sin(rad) * PANEL_RADIUS
        sx, sy = (1 if px > 0 else -1), (1 if py > 0 else -1)
        paths = []
        for offset in (-0.5, 0.0, 0.5):
            start = (px + sx * 1.6, py + offset)
            mid = (px + sx * 4.5, py + offset)
            jog = (mid[0] + sx * 2.0, mid[1] + sy * 2.0)
            end = (sx * (HALF_W - 0.5), jog[1])
            paths += [line(start, mid), line(mid, jog), line(jog, end)]
        teams.append(bd.Compound(children=paths))
    return teams


def proxy_platform():
    """Slightly smaller than the live platform, so a small camera move never exposes it."""
    pts = [(0, 0), (9.62, 0), (9.62, 0.13), (9.5, 0.2), (9.2, 0.3), (9.1, 0.46), (0, 0.46)]
    wire = bd.Wire.make_polygon([v(r, 0, z) for r, z in pts], close=True)
    return bd.Compound(children=[bd.revolve(bd.Face(wire), bd.Axis.Z, 360)])


def panel_frames():
    parts = []
    for a in TEAM_ANGLES:
        rad = math.radians(a)
        x, y = math.cos(rad) * PANEL_RADIUS, math.sin(rad) * PANEL_RADIUS
        yaw = math.atan2(-x, 28 + y) * 0.9
        block = box(-1.45, 1.45, -0.32, 0.3, 0, 3.7)
        parts.append(bd.Pos(x, y, 0) * bd.Rotation(0, 0, math.degrees(yaw)) * block)
    return bd.Compound(children=parts)


def panel_screens():
    out = []
    for a in TEAM_ANGLES:
        rad = math.radians(a)
        x, y = math.cos(rad) * PANEL_RADIUS, math.sin(rad) * PANEL_RADIUS
        yaw = math.atan2(-x, 28 + y) * 0.9
        out.append(bd.Compound(children=[bd.Pos(x, y, 0) * bd.Rotation(0, 0, math.degrees(yaw)) * box(-1.05, 1.05, -0.34, -0.32, 0.9, 3.4)]))
    return out


@model
def mc_stone():
    return room_stone()


@model
def mc_trim():
    return room_trim()


@model
def mc_glass():
    return room_glass()


@model
def mc_floor():
    return floor_slabs()


def stone_arch():
    """A freestanding pointed arch at the end of the path, echoing Gasson's Gothic line. Built for this scene, not from a pack."""
    y0, depth, w, inner, sill, apex = 50.0, 1.7, 12.0, 8.6, 0.0, 15.0
    ring = arch_prism(0, w, sill, apex, y0, depth) - arch_prism(0, inner, sill - 0.5, apex - 2.0, y0 - 0.1, depth + 0.2)
    parts = [ring]
    for s_ in (-1, 1):
        parts.append(box(s_ * w / 2 - 1.5, s_ * w / 2 + 1.5, y0 - 0.5, y0 + depth + 0.5, 0, 1.2))
        parts.append(box(s_ * (inner / 2 + 0.85) - 1.3, s_ * (inner / 2 + 0.85) + 1.3, y0 - 0.25, y0 + depth + 0.25, 5.6, 6.0))
    hood = arch_prism(0, w + 0.7, sill + 6, apex + 0.45, y0 - 0.22, 0.25) - arch_prism(0, w - 0.1, sill + 5.8, apex + 0.02, y0 - 0.3, 0.4)
    parts.append(hood)
    return bd.Compound(children=parts)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    print("arch tris", write_obj(stone_arch().scale(1000), OUT / "arch.obj", 2.0, 0.3))
