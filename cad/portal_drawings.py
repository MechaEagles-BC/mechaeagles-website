"""Illustrative screens for the Combat Robotics and AI Safety portals. Neither is team hardware or a product.
Run: cadgen +0.8.3 run cad/portal_drawings.py"""
import math

import build123d as bd
from cadgen import model

from foundation import PARTS_DIR, write_obj
from portal import box, prism_xz, tube, v


def wheel_y(x, y, z, radius, width):
    """A low-faceted wheel whose axle runs along Y."""
    sides = 14
    pts = [v(x + radius * math.cos(i * math.tau / sides), y - width / 2, z + radius * math.sin(i * math.tau / sides)) for i in range(sides)]
    tire = bd.extrude(bd.Face(bd.Wire.make_polygon(pts, close=True)), width, dir=(0, 1, 0))
    hub = bd.Pos(x, y, z) * bd.Rotation(90, 0, 0) * bd.Cylinder(radius * 0.42, width + 10)
    return [tire, hub]


def robot_body():
    """A generic vertical-spinner layout: wedge chassis, drive wheels, and a two-toothed disc at the front."""
    half_w = 180
    parts = [prism_xz([(-260, 0), (150, 0), (240, 34), (240, 66), (120, 150), (-235, 150), (-260, 125)], -half_w, half_w)]
    parts = [parts[0] - box(95, 300, -46, 46, -1, 200)]  # the slot the weapon runs in
    parts.append(box(-225, 100, -half_w + 16, half_w - 16, 150, 160))  # top plate
    for x in (-205, -100, 5, 88):
        for y in (-half_w + 34, half_w - 34):
            parts.append(bd.Pos(x, y, 164) * bd.Cylinder(9, 8))
    for x in (-150, -60):
        for s in (-1, 1):
            parts.append(box(x - 30, x + 30, s * 52 - 6, s * 52 + 6, 160, 182))  # vents
    for s in (-1, 1):
        for x in (-165, 25):
            parts += wheel_y(x, s * (half_w + 30), 60, 60, 52)
        parts.append(box(-230, 96, s * half_w - 5, s * half_w + 5, 12, 104))  # side armour edge
        parts.append(prism_xz([(150, 0), (330, 0), (330, 10), (150, 44)], s * 90 - 12, s * 90 + 12))  # forks
    # the weapon: a toothed disc on a dead shaft
    cx, cz, radius = 215, 118, 112
    pts = []
    for tooth in (0.0, math.pi):
        rim = [(0.36 + (math.pi - 0.41) * i / 14, radius) for i in range(15)]
        for a, r in [(0.0, radius + 34), (0.26, radius + 34), *rim]:
            pts.append(v(cx + r * math.cos(tooth + a), -9, cz + r * math.sin(tooth + a)))
    disc = bd.extrude(bd.Face(bd.Wire.make_polygon(pts, close=True)), 18, dir=(0, 1, 0))
    for i in range(6):
        a = i * math.tau / 6
        disc = disc - bd.Pos(cx + 66 * math.cos(a), 0, cz + 66 * math.sin(a)) * bd.Rotation(90, 0, 0) * bd.Cylinder(15, 30)
    parts.append(disc)
    parts.append(tube((cx, -55, cz), (cx, 55, cz), 14, 8))
    for s in (-1, 1):
        parts.append(prism_xz([(95, 40), (cx + 22, cz - 22), (cx + 22, cz + 22), (95, 140)], s * 44 - 6, s * 44 + 6))  # weapon uprights
    centre = bd.Pos(-20, 0, -95)
    return bd.Compound(children=[centre * p for p in parts])


@model
def combat_robot():
    shape = robot_body()
    shape.label = "combat_robot"
    return shape


def node(p, r):
    return bd.Pos(*p) * bd.Rotation(35, 45, 0) * bd.Box(r, r, r)


def lattice_body():
    """An abstract layered network inside two monitoring rings. It describes an idea, not a system the team has built."""
    layers = [(-330, 4, 2), (-110, 6, 2), (110, 6, 2), (330, 3, 1)]
    positions = []
    for x, rows, columns in layers:
        layer = []
        for r in range(rows):
            for c in range(columns):
                y = (c - (columns - 1) / 2) * 180
                z = (r - (rows - 1) / 2) * 110
                layer.append((x, y, z))
        positions.append(layer)
    parts = []
    for layer in positions:
        parts += [node(p, 34) for p in layer]
    for a, b in zip(positions, positions[1:]):
        for i, p in enumerate(a):
            for j, q in enumerate(b):
                if (i + j) % 2 == 0:  # every other link keeps the drawing legible
                    parts.append(tube(p, q, 1.8, 3))
    for radius, tilt in ((470, 0), (500, 18)):
        sides = 36
        pts = [(radius * math.cos(i * math.tau / sides), radius * math.sin(i * math.tau / sides)) for i in range(sides)]
        ring = []
        for i in range(sides):
            ax, az = pts[i]
            bx, bz = pts[(i + 1) % sides]
            ring.append(tube((ax, 0, az), (bx, 0, bz), 4, 4))
        parts += [bd.Rotation(0, 0, tilt) * r for r in ring]
    return bd.Compound(children=parts)


@model
def ai_lattice():
    shape = lattice_body()
    shape.label = "ai_lattice"
    return shape


if __name__ == "__main__":
    print("robot tris", write_obj(combat_robot().shape, PARTS_DIR / "combat_robot.obj", 1.0, 0.5))
    print("lattice tris", write_obj(ai_lattice().shape, PARTS_DIR / "ai_lattice.obj", 1.0, 0.5))
