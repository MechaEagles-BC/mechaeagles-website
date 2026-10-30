"""Gasson Hall facade as parametric CAD, in metres. Replaces the plain massing around the tower.
The quad front is read from quad-2018.jpg, tower-postcard.jpg and modern-2011.jpg, with heights scaled from the unverified
61 m tip. The outer sides and rear are assumed: a plain window grid, because no photo here shows them clearly.
Run: cadgen +0.8.3 run gasson/facade.py
"""
import json
import sys
from pathlib import Path

import build123d as bd
from cadgen import model

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "cad"))
from foundation import write_obj  # noqa: E402

P = json.loads((HERE / "fitted.json").read_text())
R, W, F = P["range"], P["wing"], P["front"]
WX0, WX1, WY0, WY1, WALL, PEAK = W["x0"], W["x1"], W["y0"], W["y1"], W["wall"], W["peak"]
WC = (WX0 + WX1) / 2


def v(*p):
    return bd.Vector(*p)


def box(x0, x1, y0, y1, z0, z1):
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(x1 - x0, y1 - y0, z1 - z0)


def wall_frame(side, at):
    """A local frame on one outer wall: u runs along the wall, +y points into the building, -y outward."""
    return {
        "front": bd.Pos(0, at, 0),
        "back": bd.Pos(0, at, 0) * bd.Rotation(0, 0, 180),
        "right": bd.Pos(at, 0, 0) * bd.Rotation(0, 0, 90),
        "left": bd.Pos(at, 0, 0) * bd.Rotation(0, 0, -90),
    }[side]


class Wall:
    def __init__(self, side, at):
        self.place = wall_frame(side, at)
        self.cuts, self.adds = [], []

    def window(self, u, z0, z1, width, lights, transoms=0, depth=0.3):
        self.cuts.append(self.place * box(u - width / 2, u + width / 2, -0.01, depth, z0, z1))
        a = self.adds
        t = 0.13
        for x0, x1, a0, a1 in ((u - width / 2 - t, u - width / 2, z0 - t, z1 + t), (u + width / 2, u + width / 2 + t, z0 - t, z1 + t)):
            a.append(self.place * box(x0, x1, -0.07, 0.03, a0, a1))
        a.append(self.place * box(u - width / 2 - t, u + width / 2 + t, -0.1, 0.03, z1, z1 + t + 0.07))  # label
        a.append(self.place * box(u - width / 2 - t - 0.06, u + width / 2 + t + 0.06, -0.14, 0.03, z0 - t - 0.06, z0))  # sill
        for i in range(1, lights):
            x = u - width / 2 + i * width / lights
            a.append(self.place * box(x - 0.06, x + 0.06, depth - 0.16, depth, z0, z1))
        for i in range(1, transoms + 1):
            z = z0 + i * (z1 - z0) / (transoms + 1)
            a.append(self.place * box(u - width / 2, u + width / 2, depth - 0.15, depth, z - 0.04, z + 0.04))

    def lancet(self, u, z0, z1, width):
        rise = width * 0.9
        pts = [(u - width / 2, z0), (u + width / 2, z0), (u + width / 2, z1 - rise), (u, z1), (u - width / 2, z1 - rise)]
        wire = bd.Wire.make_polygon([v(x, -0.01, z) for x, z in pts], close=True)
        self.cuts.append(self.place * bd.extrude(bd.Face(wire), 0.26, dir=(0, 1, 0)))

    def door(self, u, width, height):
        rise = width * 0.75
        pts = [(u - width / 2, 0.0), (u + width / 2, 0.0), (u + width / 2, height - rise), (u + width * 0.28, height - rise * 0.25), (u, height), (u - width * 0.28, height - rise * 0.25), (u - width / 2, height - rise)]
        wire = bd.Wire.make_polygon([v(x, -0.01, z) for x, z in pts], close=True)
        self.cuts.append(self.place * bd.extrude(bd.Face(wire), 0.5, dir=(0, 1, 0)))
        outer = [(x + (0.28 if x > u else -0.28 if x < u else 0), z + (0.3 if z > 0 else 0)) for x, z in pts]
        ring = bd.extrude(bd.Face(bd.Wire.make_polygon([v(x, -0.1, z) for x, z in outer], close=True)), 0.12, dir=(0, 1, 0))
        hole = bd.extrude(bd.Face(bd.Wire.make_polygon([v(x, -0.12, z) for x, z in pts], close=True)), 0.2, dir=(0, 1, 0))
        self.adds.append(self.place * (ring - hole))
        self.adds.append(self.place * box(u - 0.04, u + 0.04, 0.34, 0.46, 0, height))

    def band(self, u0, u1, z0, z1, proud=0.1):
        self.adds.append(self.place * box(u0, u1, -proud, 0.02, z0, z1))


def cut_all(body, walls):
    for w in walls:
        for c in w.cuts:
            body = body - c
    return body


def adds(walls):
    return [a for w in walls for a in w.adds]


def gabled_block(x0, x1, y0, y1, wall, peak):
    xm = (x0 + x1) / 2
    wire = bd.Wire.make_polygon([v(x0, y0, 0), v(x1, y0, 0), v(x1, y0, wall), v(xm, y0, peak), v(x0, y0, wall)], close=True)
    return bd.extrude(bd.Face(wire), y1 - y0, dir=(0, 1, 0))


def gable_coping(x0, x1, y, wall, peak, along=0.55):
    xm = (x0 + x1) / 2
    run, fall = (x1 - x0) / 2, peak - wall
    length = (run**2 + fall**2) ** 0.5
    slope = bd.Vector(run, 0, fall).get_angle(bd.Vector(1, 0, 0))
    out = []
    for s in (-1, 1):
        cx = xm + s * run / 2
        out.append(bd.Pos(cx, y + along / 2 - 0.12, (wall + peak) / 2 + 0.14) * bd.Rotation(0, s * slope, 0) * bd.Box(length + 0.5, along, 0.3))
        out.append(box(xm + s * run - 0.6, xm + s * run + 0.6, y - 0.14, y + 0.42, wall - 0.5, wall + 0.05))  # kneeler
    out.append(box(xm - 0.35, xm + 0.35, y - 0.12, y + 0.4, peak - 0.2, peak + 0.5))  # apex stone
    return out


def wing(sign):
    x0, x1 = sorted((sign * WX0, sign * WX1))
    cx = sign * WC
    body = gabled_block(x0, x1, WY0, WY1, WALL, PEAK)
    front, back = Wall("front", WY0), Wall("back", WY1)
    outer = Wall("right" if sign > 0 else "left", x1 if sign > 0 else x0)
    width = (WX1 - WX0) * 0.5
    # Two upper rows read as one tall group with a stone panel between, then a main row, then a basement row.
    for wall_, u in ((front, cx), (back, -cx)):
        wall_.window(u, 16.4, 20.1, width, 4, transoms=1)
        wall_.window(u, 12.1, 15.2, width, 4, transoms=1)
        wall_.window(u, 6.2, 9.8, width, 4, transoms=1)
        wall_.window(u, 1.0, 4.1, width, 4)
        wall_.band(u - width / 2 - 0.13, u + width / 2 + 0.13, 15.2, 16.4, 0.05)  # stone panel
        wall_.lancet(u, WALL + 2.2, WALL + 5.0, 0.42)
        ww = (WX1 - WX0) / 2
        for z0, z1 in ((4.75, 5.15), (10.95, 11.25), (WALL - 0.35, WALL + 0.05)):
            wall_.band(u - ww - 0.1, u + ww + 0.1, z0, z1)
    # Assumed: no photo here shows the outer side clearly.
    ys = [WY0 + (WY1 - WY0) * f for f in (0.14, 0.32, 0.5, 0.68, 0.86)]
    for y in ys:
        u = y if sign > 0 else -y
        outer.window(u, 14.2, 18.4, 2.5, 2, transoms=1)
        outer.window(u, 6.6, 10.4, 2.5, 2, transoms=1)
        outer.window(u, 1.0, 3.9, 2.5, 2)
    us = sorted((WY0 if sign > 0 else -WY0, WY1 if sign > 0 else -WY1))
    for z0, z1 in ((4.75, 5.15), (10.95, 11.25), (WALL - 0.35, WALL + 0.05)):
        outer.band(us[0], us[1], z0, z1)
    walls = [front, back, outer]
    return [cut_all(body, walls), *adds(walls), *gable_coping(x0, x1, WY0, WALL, PEAK), *gable_coping(x0, x1, WY1 - 0.43, WALL, PEAK)]


def stair_bay(sign):
    """The narrow crenellated bay between each wing and the centre, with the entrance door at its foot."""
    x0, x1 = sorted((sign * 15.2, sign * (WX0 + 0.05)))
    y0, y1, top = -1.8, 2.0, 20.6
    body = box(x0, x1, y0, y1, 0, top)
    cx = (x0 + x1) / 2
    front = Wall("front", y0)
    for z0, z1 in ((16.0, 18.8), (11.4, 13.8), (6.6, 9.0)):
        front.window(cx, z0, z1, 1.65, 2)
    front.door(cx, 2.0, 3.7)
    for z0, z1 in ((4.75, 5.15), (10.95, 11.25)):
        front.band(x0 - 0.08, x1 + 0.08, z0, z1)
    parts = [cut_all(body, [front]), *adds([front])]
    parts.append(box(x0 - 0.1, x1 + 0.1, y0 - 0.1, y1 + 0.1, top - 0.28, top))
    for i in range(3):
        mx = x0 + 0.42 + i * ((x1 - x0) - 0.84) / 2
        parts.append(box(mx - 0.38, mx + 0.38, y0, y0 + 0.45, top, top + 1.0))
        parts.append(box(mx - 0.44, mx + 0.44, y0 - 0.04, y0 + 0.49, top + 1.0, top + 1.12))
    return parts


def main_range():
    hw, y0, y1, eave, ridge = R["half_w"], R["y0"], R["y1"], R["eave"], R["ridge"]
    ym = (y0 + y1) / 2
    wire = bd.Wire.make_polygon([v(-hw, y0, 0), v(-hw, y1, 0), v(-hw, y1, eave), v(-hw, ym, ridge), v(-hw, y0, eave)], close=True)
    body = bd.extrude(bd.Face(wire), 2 * hw, dir=(1, 0, 0))
    front, back = Wall("front", y0), Wall("back", y1)
    for s in (-1, 1):
        front.window(s * 9.3, 17.3, 19.7, 4.5, 3)  # two rows above the front block
        front.window(s * 9.3, 14.1, 16.0, 4.5, 3)
        front.lancet(s * 5.6, 14.4, 19.8, 0.5)
        front.lancet(s * 12.9, 14.4, 19.8, 0.5)
    for x in (-13, -6.5, 0, 6.5, 13):  # assumed: the rear isn't shown in these photos
        back.window(x, 15.0, 18.6, 3.2, 2, transoms=1)
        back.window(x, 8.2, 11.8, 3.2, 2, transoms=1)
        back.window(x, 1.4, 4.4, 3.2, 2)
    walls = [front, back]
    parts = [cut_all(body, walls), *adds(walls)]
    parts.append(box(-15.2, 15.2, y0 - 0.2, y0 + 0.05, eave - 0.3, eave + 0.02))
    # roof lines: ridge cap, and a row of seams that give the slates some structure in edge light
    parts.append(box(-hw, hw, ym - 0.14, ym + 0.14, ridge - 0.06, ridge + 0.14))
    for sx in (-1, 1):
        parts.append(box(sx * 17.3 - 0.75, sx * 17.3 + 0.75, 9.0, 10.5, eave, ridge + 2.9))  # chimney stack
        parts.append(box(sx * 17.3 - 0.86, sx * 17.3 + 0.86, 8.9, 10.6, ridge + 2.7, ridge + 3.0))
    return parts


def front_block():
    hw, y0, y1, top = F["half_w"], F["y0"], F["y1"], F["top"]
    body = box(-hw, hw, y0, y1, 0, top)
    front = Wall("front", y0)
    # the long stained-glass row: a wide central group between two narrower ones
    for u, width, lights in ((-9.8, 4.8, 3), (0.0, 7.6, 5), (9.8, 4.8, 3)):
        front.window(u, 7.5, 11.2, width, lights, transoms=1)
        front.window(u, 1.1, 3.7, width, lights)
    for s in (-1, 1):
        front.lancet(s * 5.85, 7.5, 11.1, 0.6)
    front.band(-hw - 0.05, hw + 0.05, 4.2, 4.65, 0.14)  # the ashlar base stops here
    front.band(-hw - 0.05, hw + 0.05, 5.7, 5.95, 0.08)
    front.band(-hw - 0.05, hw + 0.05, top - 0.8, top - 0.5, 0.12)
    parts = [cut_all(body, [front]), *adds([front])]
    parts.append(box(-hw - 0.14, hw + 0.14, y0 - 0.14, y1, top - 0.2, top + 0.05))
    for s in (-1, 1):  # paired pilasters above the central row, ending in small finials
        for x in (s * 5.05, s * 6.65):
            parts.append(box(x - 0.14, x + 0.14, y0 - 0.2, y0, 11.0, top + 0.65))
            parts.append(box(x - 0.2, x + 0.2, y0 - 0.26, y0 + 0.06, top + 0.65, top + 0.85))
    return parts


def facade_body():
    parts = [*main_range(), *front_block()]
    for sign in (-1, 1):
        parts += wing(sign)
        parts += stair_bay(sign)
    return bd.Compound(children=parts)


@model
def gasson_facade():
    shape = facade_body()
    shape.label = "gasson_facade"
    return shape


if __name__ == "__main__":
    doc = gasson_facade()
    print("facade tris", write_obj(doc.shape.scale(1000), HERE / "parts" / "facade.obj", tolerance=2.0, angular=0.4))
