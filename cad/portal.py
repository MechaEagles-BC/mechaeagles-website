"""Team portal parts. Millimetres, +Z up, front faces -Y.
The frame is shared by all four teams. baja_corner is an illustrative double-wishbone suspension corner, not ME-B26 hardware:
its 23x7-10 wheel is a size that exists, not one confirmed for ME-B26 or the rules, and the rest is chosen to look right.
Run: cadgen +0.8.3 run cad/portal.py"""
import math

import build123d as bd
from cadgen import model

from foundation import PARTS_DIR, write_obj

# ---------- frame dimensions, mirrored by src/components/Portal.tsx ----------
POST_X0, POST_X1 = 1400.0, 1700.0
FACE_Y = 210.0
TOP = 4700.0
HEAD_Z = 4300.0
PLATE_Z = 1100.0
PLINTH_Z = 260.0
SCREW_ZS = [1300 + 600 * k for k in range(5)]
SCREW_XS = [1450.0, 1650.0]


def v(*p):
    return bd.Vector(*p)


def box(x0, x1, y0, y1, z0, z1):
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(x1 - x0, y1 - y0, z1 - z0)


def prism_xz(points, y0, y1):
    wire = bd.Wire.make_polygon([v(x, y0, z) for x, z in points], close=True)
    return bd.extrude(bd.Face(wire), y1 - y0, dir=(0, 1, 0))


def prism_xy(points, z0, z1):
    wire = bd.Wire.make_polygon([v(x, y, z0) for x, y in points], close=True)
    return bd.extrude(bd.Face(wire), z1 - z0)


def front_bore(x, z, y_face, radius=30.0, depth=30.0):
    return bd.Pos(x, y_face + depth / 2, z) * bd.Rotation(90, 0, 0) * bd.Cylinder(radius, depth + 1)


def post(sign):
    c = 34.0
    pts = [(POST_X0, -FACE_Y + c), (POST_X0 + c, -FACE_Y), (POST_X1 - c, -FACE_Y), (POST_X1, -FACE_Y + c), (POST_X1, FACE_Y - c), (POST_X1 - c, FACE_Y), (POST_X0 + c, FACE_Y), (POST_X0, FACE_Y - c)]
    body = prism_xy(pts, PLINTH_Z, HEAD_Z)
    body = body - box(1532, 1568, -FACE_Y - 1, -FACE_Y + 22, 1150, 4200)  # lamp channel
    for z in SCREW_ZS:
        for x in SCREW_XS:
            body = body - front_bore(x, z, -FACE_Y)
    if sign < 0:
        body = bd.mirror(body, about=bd.Plane.YZ)
    return body


def frame_body():
    parts = [post(1), post(-1)]
    head = prism_xz([(-POST_X1, HEAD_Z), (POST_X1, HEAD_Z), (POST_X1, TOP - 100), (POST_X1 - 100, TOP), (-POST_X1 + 100, TOP), (-POST_X1, TOP - 100)], -230, 230)
    head = head - box(-1250, 1250, -231, -205, 4440, 4490)  # lamp channel
    for x in (-1500, -750, 750, 1500):
        head = head - front_bore(x, 4565, -230)
    parts.append(head)
    plinth = prism_xz([(-1950, 0), (1950, 0), (1950, 160), (1850, PLINTH_Z), (-1850, PLINTH_Z), (-1950, 160)], -520, 520)
    parts.append(plinth)
    plate = box(-POST_X0, POST_X0, -200, 200, PLINTH_Z, PLATE_Z)
    plate = plate - box(-1270, 1270, -201, -178, 345, 1020)  # recess behind the team name
    parts.append(plate)
    back = box(-POST_X0, POST_X0, 130, 170, PLATE_Z, HEAD_Z)
    for x in (-700, 0, 700):
        back = back - box(x - 5, x + 5, 129, 142, PLATE_Z, HEAD_Z)
    for z in (1740, 2380, 3020, 3660):
        back = back - box(-POST_X0, POST_X0, 129, 142, z - 5, z + 5)
    parts.append(back)
    for z in (1420, 2060, 2700, 3340, 3980):  # stiffeners, visible past the rim from the side
        parts.append(box(-POST_X0, POST_X0, 170, 300, z - 18, z + 18))
    for s in (-1, 1):  # gussets give the opening its chamfered outline
        x = s * POST_X0
        parts.append(prism_xz([(x, HEAD_Z), (x, HEAD_Z - 340), (x - s * 340, HEAD_Z)], -150, 150))
        parts.append(prism_xz([(x, PLATE_Z), (x, PLATE_Z + 340), (x - s * 340, PLATE_Z)], -150, 150))
    return bd.Compound(children=parts)


@model
def portal_frame():
    shape = frame_body()
    shape.label = "portal_frame"
    return shape


# ---------- illustrative suspension corner ----------
def tube(a, b, radius, sides=6):
    a, b = v(*a), v(*b)
    d = (b - a).normalized()
    helper = v(0, 0, 1) if abs(d.Z) < 0.9 else v(1, 0, 0)
    u = d.cross(helper).normalized()
    w = d.cross(u).normalized()
    pts = [a + u * (radius * math.cos(i * math.tau / sides)) + w * (radius * math.sin(i * math.tau / sides)) for i in range(sides)]
    return bd.extrude(bd.Face(bd.Wire.make_polygon(pts, close=True)), (b - a).length, dir=d)


def revolve(*profile):
    wire = bd.Wire.make_polygon([v(r, 0, z) for r, z in profile], close=True)
    return bd.revolve(bd.Face(wire), bd.Axis.Z, 360)


def wheel_parts():
    """Built around Z with +Z inboard. 23 x 7-10: 292 mm outer radius, 178 mm wide, 127 mm rim radius."""
    parts = [revolve((127, -78), (205, -89), (262, -89), (284, -68), (284, 68), (262, 89), (205, 89), (127, 78))]
    for i in range(32):  # chevron tread blocks
        a = i * 360 / 32
        for s, off in ((-1, 0.0), (1, 360 / 64)):
            lug = bd.Pos(287, 0, s * 42) * bd.Rotation(s * 22, 0, 0) * bd.Box(12, 28, 70)
            parts.append(bd.Rotation(0, 0, a + off) * lug)
    barrel = revolve((127, -80), (127, 80), (116, 80), (112, 40), (112, -40), (116, -80))
    disc = bd.Pos(0, 0, 40) * bd.Cylinder(112, 12)
    for i in range(6):
        a = math.radians(i * 60 + 30)
        disc = disc - bd.Pos(76 * math.cos(a), 76 * math.sin(a), 40) * bd.Cylinder(22, 20)
    parts += [barrel, disc]
    for i in range(4):
        a = math.radians(i * 90)
        parts.append(bd.Pos(40 * math.cos(a), 40 * math.sin(a), 30) * bd.extrude(bd.RegularPolygon(8, 6), 12))
    parts.append(revolve((0, 22), (28, 22), (28, 46), (52, 52), (52, 96), (30, 96), (30, 120), (0, 120)))  # hub
    rotor = bd.Pos(0, 0, 88) * bd.Cylinder(88, 5)
    for i in range(10):
        a = math.radians(i * 36)
        rotor = rotor - bd.Pos(68 * math.cos(a), 68 * math.sin(a), 88) * bd.Cylinder(5, 8)
    parts.append(rotor)
    parts.append(bd.Pos(0, 72, 88) * bd.Box(64, 40, 26))  # caliper
    return parts


def corner_body():
    turn = bd.Rotation(0, 90, 0)  # the axle runs along X, with +X inboard
    parts = [turn * p for p in wheel_parts()]
    parts.append(prism_xz([(70, -192), (130, -192), (142, -60), (142, 60), (132, 172), (82, 172), (92, 60), (92, -60)], -20, 20))  # upright
    lower_ball, upper_ball = (100, 0, -178), (112, 0, 168)
    frame_x = 560
    for ball, y, z in ((lower_ball, 135, -130), (upper_ball, 112, 122)):
        for s in (-1, 1):
            parts.append(tube(ball, (frame_x, s * y, z), 12))
            parts.append(bd.Pos(frame_x, s * y, z) * bd.Rotation(90, 0, 0) * bd.Cylinder(17, 42))
        parts.append(bd.Pos(*ball) * bd.Sphere(19))
    parts.append(tube((330, -66, -154), (330, 66, -154), 9))  # shock mount crossbrace
    # coil-over, leaning inboard from the lower arm to the frame
    lo, hi = v(340, 0, -150), v(frame_x + 20, 0, 340)
    axis = hi - lo
    d = axis.normalized()
    parts.append(tube(lo, lo + axis * 0.62, 22, 8))
    parts.append(tube(lo + axis * 0.62, hi, 9, 6))
    for t in (0.12, 0.9):
        c = lo + axis * t
        parts.append(tube(c, c + d * 8, 52, 12))
    u = d.cross(v(0, 1, 0)).normalized()
    w = d.cross(u).normalized()
    turns, steps = 6, 9
    prev = None
    for i in range(turns * steps + 1):
        a = i * math.tau / steps
        p = lo + axis * (0.14 + 0.74 * i / (turns * steps)) + u * (46 * math.cos(a)) + w * (46 * math.sin(a))
        if prev is not None:
            parts.append(tube(prev, p, 6, 4))
        prev = p
    parts.append(tube((142, 0, 0), (frame_x, 0, -10), 11))  # half shaft
    # chassis stub
    for s in (-1, 1):
        parts.append(tube((frame_x, s * 170, -210), (frame_x, s * 170, 390), 15))
        parts.append(tube((frame_x, s * 170, 390), (frame_x + 70, s * 170, 390), 15))
        parts.append(tube((frame_x, s * 170, -210), (frame_x + 70, s * 170, -210), 15))
    for z in (-210, 390):
        parts.append(tube((frame_x, -170, z), (frame_x, 170, z), 15))
    parts.append(tube((frame_x, -170, -210), (frame_x, 170, 390), 11))
    centre = bd.Pos(-265, 0, -60)
    return bd.Compound(children=[centre * p for p in parts])


@model
def baja_corner():
    shape = corner_body()
    shape.label = "baja_corner"
    return shape


if __name__ == "__main__":
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    print("frame tris", write_obj(portal_frame().shape, PARTS_DIR / "portal_frame.obj"))
    print("corner tris", write_obj(baja_corner().shape, PARTS_DIR / "baja_corner.obj", 1.0, 0.5))
