"""Parametric parts of the Mission Control foundation. Millimetres, +Z up, rotation axis at the origin.
Illustrative machinery, not team hardware. Run: cadgen +0.8.3 run cad/foundation.py"""
import math
from pathlib import Path

import build123d as bd
from cadgen import model

from gear_math import involute_points

# ---------- shared dimensions ----------
RING_TEETH = 120
PINION_TEETH = 16
RING_PITCH_R = 4300.0
MODULE = 2 * RING_PITCH_R / RING_TEETH
PINION_PITCH_R = MODULE * PINION_TEETH / 2
PINION_CENTRE = RING_PITCH_R - PINION_PITCH_R
PRESSURE_ANGLE = math.radians(20)
BACKLASH = 0.04 * MODULE

DECK_Z, RING_Z = 340.0, 360.0
SPAR_OUT, SPAR_IN = 8100.0, 2700.0
GROOVES = [(7070, 7020), (5680, 5630), (3070, 3040)]
PARTS_DIR = Path(__file__).resolve().parent / "parts"


# ---------- helpers ----------
def involute_outline(teeth, tooth_thickness, r_tip, r_root):
    pts = involute_points(teeth, MODULE, PRESSURE_ANGLE, tooth_thickness, r_tip, r_root)
    return bd.Wire.make_polygon([bd.Vector(x, y, 0) for x, y in pts], close=True)


def turned(*profile):
    """Revolve a closed (radius, z) profile about Z."""
    wire = bd.Wire.make_polygon([bd.Vector(r, 0, z) for r, z in profile], close=True)
    return bd.revolve(bd.Face(wire), bd.Axis.Z, 360)


def turned_arc(sweep_deg, *profile):
    """Revolve a profile through sweep_deg, centred on +X."""
    wire = bd.Wire.make_polygon([bd.Vector(r, 0, z) for r, z in profile], close=True)
    solid = bd.revolve(bd.Face(wire), bd.Axis.Z, sweep_deg)
    return bd.Rotation(0, 0, -sweep_deg / 2) * solid


def cyl(radius, height, x=0.0, y=0.0, z=0.0):
    return bd.Pos(x, y, z) * bd.Cylinder(radius, height, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))


def at_polar(radius, angle_deg):
    a = math.radians(angle_deg)
    return radius * math.cos(a), radius * math.sin(a)


def counterbore(part, x, y, top, bore=26.0, cb=48.0, depth=42.0, through=200.0):
    return part - cyl(cb, depth + 1, x, y, top - depth) - cyl(bore, through, x, y, top - through)


def named(shape, name):
    shape.label = name
    return shape


# ---------- gears ----------
def ring_gear_body():
    hole_t = math.pi * MODULE / 2 + BACKLASH
    hole = involute_outline(RING_TEETH, hole_t, RING_PITCH_R + 1.25 * MODULE, RING_PITCH_R - 0.8 * MODULE)
    outer = bd.Wire.make_circle(5540)
    gear = bd.extrude(bd.Face(outer, [hole]), 250)
    lip = turned((5540, 250), (5540, 275), (5522, 293), (4686, 293), (4668, 275), (4668, 250))
    part = gear + lip
    for i in range(36):
        x, y = at_polar(5200, i * 10 + 5)
        part = counterbore(part, x, y, 293, bore=22, cb=46, depth=34, through=80)
    return part


@model
def ring_gear():
    return named(ring_gear_body(), "ring_gear")


def pinion_body():
    rp = PINION_PITCH_R
    teeth = involute_outline(PINION_TEETH, math.pi * MODULE / 2 - BACKLASH, rp + MODULE, rp - 1.25 * MODULE)
    bore = bd.Wire.make_circle(115)
    gear = bd.extrude(bd.Face(teeth, [bore]), 250)
    for i in range(6):
        x, y = at_polar(315, i * 60 + 30)
        gear = gear - cyl(66, 300, x, y, -20)
    hub = turned((240, 250), (240, 300), (222, 318), (135, 318), (115, 298), (115, 250))
    return gear + hub


@model
def pinion():
    return named(pinion_body(), "pinion")


# ---------- turned structure ----------
@model
def plinth():
    profile = [(0, 0), (9750, 0), (9750, 120), (9690, 180), (9460, 180), (9460, 300), (9420, DECK_Z)]
    for ro, ri in GROOVES:  # the light channels are cut into the base plate
        profile += [(ro, DECK_Z), (ro, DECK_Z - 24), (ri, DECK_Z - 24), (ri, DECK_Z)]
    profile += [(0, DECK_Z)]
    return named(turned(*profile), "plinth")


@model
def collar():
    body = turned((2470, DECK_Z), (2470, 640), (2430, 680), (2285, 680), (2250, 645), (2250, 500), (2120, 500), (2120, DECK_Z))
    for i in range(24):
        x, y = at_polar(2375, i * 15 + 7.5)
        body = counterbore(body, x, y, 680, bore=16, cb=30, depth=22, through=60)
    return named(body, "collar")


def fin_ring_body():
    inner = turned((2620, RING_Z), (2620, 565), (2605, 580), (2515, 580), (2500, 565), (2500, RING_Z))
    outer = turned((3020, RING_Z), (3020, 565), (3005, 580), (2915, 580), (2900, 565), (2900, RING_Z))
    fin = bd.Pos(2760, 0, 455) * bd.Box(300, 26, 170)
    fin = bd.chamfer(fin.edges().group_by(bd.Axis.Z)[-1], 6)
    fins = [bd.Rotation(0, 0, i * 7.5) * fin for i in range(48)]
    return bd.Compound(children=[inner, outer, *fins])


@model
def fin_ring():
    return named(fin_ring_body(), "fin_ring")


# ---------- segmented plates ----------
def deck_plate_body():
    sweep = 360 / 32 - 0.16
    r_o, r_i, top = 9200.0, 7180.0, DECK_Z + 130
    plate = turned_arc(sweep, (r_o, DECK_Z), (r_o, top - 10), (r_o - 10, top), (r_i + 10, top), (r_i, top - 10), (r_i, DECK_Z))
    # shallow machined pocket, leaving a raised perimeter and a centre rib
    for span in ((-sweep / 2 + 1.1, -0.45), (0.45, sweep / 2 - 1.1)):
        arc = span[1] - span[0]
        pocket = turned_arc(arc, (r_o - 230, top - 20), (r_o - 230, top + 5), (r_i + 230, top + 5), (r_i + 230, top - 20))
        plate = plate - bd.Rotation(0, 0, (span[0] + span[1]) / 2) * pocket
    for r in (r_o - 115, r_i + 115):
        for a in (-sweep / 2 + 0.75, 0, sweep / 2 - 0.75):
            x, y = at_polar(r, a)
            plate = counterbore(plate, x, y, top, bore=24, cb=46, depth=34, through=100)
    return plate


@model
def deck_plate():
    return named(deck_plate_body(), "deck_plate")


def bearing_panel_body():
    sweep = 15 - 0.2
    r_o, r_i, top = 6940.0, 5780.0, RING_Z + 280
    panel = turned_arc(sweep, (r_o, RING_Z), (r_o, top - 14), (r_o - 14, top), (r_i + 14, top), (r_i, top - 14), (r_i, RING_Z))
    pocket = turned_arc(sweep - 3.2, (r_o - 170, top - 60), (r_o - 170, top + 5), (r_i + 170, top + 5), (r_i + 170, top - 60))
    panel = panel - pocket
    # raised instrument island, then a row of cooling slots through the pocket floor
    island = turned_arc(sweep - 7.5, (r_o - 300, top - 60), (r_o - 300, top - 22), (r_o - 312, top - 10), (r_i + 312, top - 10), (r_i + 300, top - 22), (r_i + 300, top - 60))
    panel = panel + island
    for i in range(4):
        a = -sweep / 2 + 1.75 + i * 0.5
        for side in (a, -a):
            slot = turned_arc(0.24, (r_o - 205, top - 120), (r_o - 205, top - 40), (r_i + 205, top - 40), (r_i + 205, top - 120))
            panel = panel - bd.Rotation(0, 0, side) * slot
    for r in (r_o - 85, r_i + 85):
        for a in (-sweep / 2 + 0.8, 0, sweep / 2 - 0.8):
            x, y = at_polar(r, a)
            panel = counterbore(panel, x, y, top, bore=24, cb=44, depth=34, through=100)
    return panel


@model
def bearing_panel():
    return named(bearing_panel_body(), "bearing_panel")


# ---------- spars and couplers ----------
def spar_body():
    """A rolled I-section with a light channel in the top flange. Runs along +X from SPAR_IN to SPAR_OUT."""
    w, h, t, web = 460.0, 170.0, 34.0, 70.0
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, t), (web / 2, t + 14), (web / 2, h - t - 14), (w / 2, h - t), (w / 2, h), (-w / 2, h), (-w / 2, h - t), (-web / 2, h - t - 14), (-web / 2, t + 14), (-w / 2, t)]
    wire = bd.Wire.make_polygon([bd.Vector(0, y, z) for y, z in pts], close=True)
    beam = bd.extrude(bd.Face(wire), SPAR_OUT - SPAR_IN, dir=(1, 0, 0))
    beam = bd.Pos(SPAR_IN, 0, 0) * beam
    channel = bd.Pos((SPAR_IN + SPAR_OUT) / 2, 0, h - 9) * bd.Box(SPAR_OUT - SPAR_IN - 220, 44, 20)
    beam = beam - channel
    for x in (SPAR_IN + 40, SPAR_OUT - 40):  # end plates
        beam = beam + bd.Pos(x, 0, h / 2) * bd.Box(80, w + 30, h + 26)
    for x in (SPAR_IN + 40, SPAR_OUT - 40):
        for y in (-w / 2 + 40, w / 2 - 40):
            beam = beam - cyl(20, 40, x, y, h - 5)
    return beam


@model
def spar():
    return named(spar_body(), "spar")


@model
def post():
    return named(turned((0, 0), (135, 0), (135, 26), (82, 56), (72, 300), (118, 330), (118, 355), (0, 355)), "post")


def coupler_body():
    """Fixed housing at the outer end of a spar, its lamp facing outward along +X."""
    pts = [(-480, -560), (340, -560), (640, -300), (640, 300), (340, 560), (-480, 560)]
    wire = bd.Wire.make_polygon([bd.Vector(x, y, 0) for x, y in pts], close=True)
    block = bd.extrude(bd.Face(wire), 560)
    block = bd.chamfer(block.edges().group_by(bd.Axis.Z)[-1], 24)
    lamp = bd.Pos(560, 0, 548) * bd.Box(150, 780, 40)
    block = block - lamp
    pocket = bd.Pos(-70, 0, 552) * bd.Box(620, 760, 30)
    block = block - pocket
    for i in range(7):  # heat-sink ribs across the pocket
        y = -300 + i * 100
        block = block + bd.Pos(-70, y, 544) * bd.Box(620, 26, 20)
    for x, y in ((-420, -500), (-420, 500), (290, -500), (290, 500)):
        block = counterbore(block, x, y, 560, bore=20, cb=38, depth=28, through=60)
    return block


@model
def coupler():
    return named(coupler_body(), "coupler")


@model
def cap_screw():
    """Socket-head cap screw head, sized for the 46 mm counterbores. Origin at the underside of the head."""
    head = turned((0, 0), (40, 0), (40, 34), (34, 40), (0, 40))
    socket = bd.Pos(0, 0, 40 - 12) * bd.extrude(bd.RegularPolygon(17, 6), 13)
    return named(head - socket, "cap_screw")


@model
def shaft():
    """Fixed drive shaft through a pinion hub, with a retaining cap."""
    return named(turned((0, 0), (112, 0), (112, 318), (150, 318), (150, 338), (132, 356), (0, 356)), "shaft")


TURNED = {"plinth", "deck_plate", "bearing_panel", "ring_gear", "fin_ring", "collar"}
COARSE = {"cap_screw": (3.0, 0.8), "post": (1.5, 0.6), "shaft": (2.0, 0.6)}
PARTS = [shaft, plinth, deck_plate, bearing_panel, ring_gear, pinion, fin_ring, collar, spar, post, coupler, cap_screw]

def refine_arcs(verts, tris, max_seg=180.0):
    """Split long chords on circles about the part axis, placing each new vertex back on the true radius.
    The mesher's tolerance is relative, so a rim fine enough to look round would also spend hundreds of triangles on every bolt hole.
    Only creases can be real rims: a chord across a flat face must stay straight, or the split cascades through the face."""
    key = lambda a, b: (min(a, b), max(a, b))

    def normal(t):
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = (verts[i] for i in t)
        u, v = (bx - ax, by - ay, bz - az), (cx - ax, cy - ay, cz - az)
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        m = math.hypot(*n) or 1.0
        return (n[0] / m, n[1] / m, n[2] / m)

    edge_normals = {}
    for t in tris:
        n = normal(t)
        for p, q in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            edge_normals.setdefault(key(p, q), []).append(n)
    arcs = {e for e, ns in edge_normals.items() if len(ns) == 2 and sum(x * y for x, y in zip(*ns)) < 0.999}
    mids = {}

    def split(a, b):
        k = key(a, b)
        if k in mids:
            return mids[k]
        mids[k] = None
        if k not in arcs:
            return None
        va, vb = verts[a], verts[b]
        ra, rb = math.hypot(va[0], va[1]), math.hypot(vb[0], vb[1])
        if abs(ra - rb) > 0.5 or abs(va[2] - vb[2]) > 0.01 or ra < 200 or math.dist(va, vb) <= max_seg:
            return None
        x, y = (va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2
        scale = ra / math.hypot(x, y)
        verts.append((x * scale, y * scale, va[2]))
        m = len(verts) - 1
        arcs.update((key(a, m), key(m, b)))
        mids[k] = m
        return m

    pending, done = list(tris), []
    while pending:
        a, b, c = pending.pop()
        for p, q, r in ((a, b, c), (b, c, a), (c, a, b)):
            m = split(p, q)
            if m is not None:
                pending += [(p, m, r), (m, q, r)]
                break
        else:
            done.append((a, b, c))
    return verts, done


def corner_normals(verts, tris, crease_deg=28.0, turned=False):
    """Per-corner normals: flat faces stay exactly flat, and only faces within the crease angle blend together.
    On turned parts, thin triangles can skew a blended normal sideways and make a curved chamfer ripple. A surface of
    revolution has no sideways component, so it is removed wherever a face is clearly on such a surface."""
    def unit(v):
        m = math.hypot(*v) or 1.0
        return (v[0] / m, v[1] / m, v[2] / m)

    face, around = [], {}
    for i, (a, b, c) in enumerate(tris):
        pa, pb, pc = verts[a], verts[b], verts[c]
        u = (pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2])
        v = (pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2])
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        face.append((unit(n), math.hypot(*n)))
        for x in (a, b, c):
            around.setdefault(x, []).append(i)
    limit = math.cos(math.radians(crease_deg))

    def sideways(p):
        r = math.hypot(p[0], p[1]) or 1.0
        return (-p[1] / r, p[0] / r, 0.0)

    out = []
    for i, t in enumerate(tris):
        n0 = face[i][0]
        corners = []
        for x in t:
            s = [0.0, 0.0, 0.0]
            for j in around[x]:
                n, area = face[j]
                if sum(p * q for p, q in zip(n0, n)) > limit:
                    s = [s[k] + n[k] * area for k in range(3)]
            if turned and abs(sum(p * q for p, q in zip(n0, sideways(verts[x])))) < 0.5:
                t_axis = sideways(verts[x])
                along = sum(p * q for p, q in zip(s, t_axis))
                s = [s[k] - along * t_axis[k] for k in range(3)]
            corners.append(unit(s))
        out.append(corners)
    return out


def weld(points):
    """The mesher gives each face its own vertices; weld them so faces can share edges and normals."""
    welded, verts, remap = {}, [], []
    for p in points:
        k = (round(p.X, 3), round(p.Y, 3), round(p.Z, 3))
        if k not in welded:
            welded[k] = len(verts)
            verts.append((p.X, p.Y, p.Z))
        remap.append(welded[k])
    return verts, remap


def write_obj(shape, path, tolerance=1.0, angular=0.45, arcs=False):
    """Metres, Z up. The tessellation sets small-feature detail; refine_arcs keeps the big radii of turned parts round."""
    verts, tris, normals = [], [], []
    for solid in shape.solids():
        v, t = solid.tessellate(tolerance, angular)
        w, remap = weld(v)
        t = [q for q in ((remap[a], remap[b], remap[c]) for a, b, c in t) if len(set(q)) == 3]
        if arcs:
            w, t = refine_arcs(w, t)
        base = len(verts)
        normals += corner_normals(w, t, turned=arcs)
        verts += w
        tris += [(a + base, b + base, c + base) for a, b, c in t]
    with open(path, "w", encoding="ascii") as f:
        f.writelines(f"v {x / 1000:.6f} {y / 1000:.6f} {z / 1000:.6f}\n" for x, y, z in verts)
        f.writelines(f"vn {x:.5f} {y:.5f} {z:.5f}\n" for c in normals for x, y, z in c)
        f.writelines(f"f {a + 1}//{3 * i + 1} {b + 1}//{3 * i + 2} {c + 1}//{3 * i + 3}\n" for i, (a, b, c) in enumerate(tris))
    return len(tris)


if __name__ == "__main__":
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    for part in PARTS:
        doc = part()
        print(part.__name__, "tris", write_obj(doc.shape, PARTS_DIR / f"{part.__name__}.obj", *COARSE.get(part.__name__, ()), arcs=part.__name__ in TURNED))
