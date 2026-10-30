"""Gasson Hall massing, from the reference photos in reference/gasson. Metres; x across the quad front, y back from it, z up.

Heights rest on one figure: about 200 ft (61 m) to the pinnacle tips, from secondary sources and not yet verified against
drawings. Every other size is proportional to it, read from quad-2018.jpg. This sets proportions, not surveyed dimensions.
Run: python gasson/massing.py gasson/massing.obj
"""
import json
import math
import sys
from pathlib import Path

P = {
    "tip": 61.0,
    "range": {"half_w": 24.0, "y0": 0.0, "y1": 20.0, "eave": 22.0, "ridge": 27.5},
    "wing": {"x0": 17.0, "x1": 31.0, "y0": -3.0, "y1": 26.0, "wall": 23.8, "peak": 30.8},
    "front": {"half_w": 14.0, "y0": -7.0, "y1": 0.0, "top": 13.3},
    "bay": {"half_w": 5.6, "y0": -1.5, "y1": 5.0, "wall": 22.0, "peak": 28.6},
    "tower": {"half_w": 7.0, "y0": 4.0, "y1": 18.0, "top": 47.5, "battlement": 50.2, "merlon_w": 1.4},
    "turret": {"r": 2.05, "inset": 1.0, "base": 39.0, "shoulder": 54.0},
    "cross": {"z0": 50.2, "z1": 55.4, "w": 0.45, "arm": 1.5},
}


# Proportions solved from the photos by landmark_fit.py, when present. The values above are its starting estimate.
FITTED = Path(__file__).with_name("fitted.json")
if FITTED.exists() and "landmark_fit" not in Path(sys.argv[0]).name:
    P = json.loads(FITTED.read_text())


class Mesh:
    def __init__(self):
        self.verts, self.faces = [], []

    def face(self, *pts):
        base = len(self.verts) + 1
        self.verts += pts
        self.faces.append(tuple(range(base, base + len(pts))))

    def box(self, x0, x1, y0, y1, z0, z1):
        c = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        self.face(*[(x, y, z0) for x, y in reversed(c)])
        self.face(*[(x, y, z1) for x, y in c])
        for i in range(4):
            (a, b), (d, e) = c[i], c[(i + 1) % 4]
            self.face((a, b, z0), (d, e, z0), (d, e, z1), (a, b, z1))

    def gable_y(self, x0, x1, y0, y1, wall, peak):
        """Block with its ridge running back from the front, so the gable faces the quad."""
        self.box(x0, x1, y0, y1, 0, wall)
        xm = (x0 + x1) / 2
        self.face((x0, y0, wall), (x1, y0, wall), (xm, y0, peak))
        self.face((x1, y1, wall), (x0, y1, wall), (xm, y1, peak))
        self.face((x1, y0, wall), (x1, y1, wall), (xm, y1, peak), (xm, y0, peak))
        self.face((x0, y1, wall), (x0, y0, wall), (xm, y0, peak), (xm, y1, peak))

    def gable_x(self, x0, x1, y0, y1, wall, peak):
        """Block with its ridge running across the front."""
        self.box(x0, x1, y0, y1, 0, wall)
        ym = (y0 + y1) / 2
        self.face((x0, y1, wall), (x0, y0, wall), (x0, ym, peak))
        self.face((x1, y0, wall), (x1, y1, wall), (x1, ym, peak))
        self.face((x0, y0, wall), (x1, y0, wall), (x1, ym, peak), (x0, ym, peak))
        self.face((x1, y1, wall), (x0, y1, wall), (x0, ym, peak), (x1, ym, peak))

    def turret(self, x, y, r, z0, z1, tip, sides=8):
        ring = [(x + r * math.cos(i * math.tau / sides + math.pi / 8), y + r * math.sin(i * math.tau / sides + math.pi / 8)) for i in range(sides)]
        for i in range(sides):
            (a, b), (c, d) = ring[i], ring[(i + 1) % sides]
            self.face((a, b, z0), (c, d, z0), (c, d, z1), (a, b, z1))
            self.face((a, b, z1), (c, d, z1), (x, y, tip))


def build(p=P):
    m = Mesh()
    r, w, f, b, t, u, c = p["range"], p["wing"], p["front"], p["bay"], p["tower"], p["turret"], p["cross"]
    m.gable_x(-r["half_w"], r["half_w"], r["y0"], r["y1"], r["eave"], r["ridge"])
    for s in (-1, 1):
        x0, x1 = sorted((s * w["x0"], s * w["x1"]))
        m.gable_y(x0, x1, w["y0"], w["y1"], w["wall"], w["peak"])
    m.box(-f["half_w"], f["half_w"], f["y0"], f["y1"], 0, f["top"])
    m.gable_y(-b["half_w"], b["half_w"], b["y0"], b["y1"], b["wall"], b["peak"])
    m.box(-t["half_w"], t["half_w"], t["y0"], t["y1"], 0, t["top"])
    # battlements between the corner turrets, on all four sides
    span = 2 * (t["half_w"] - u["inset"] - u["r"])
    count = max(1, int(span / (2 * t["merlon_w"])))
    for i in range(count):
        a = -span / 2 + (i + 0.25) * span / count
        for y0, y1 in ((t["y0"], t["y0"] + 0.5), (t["y1"] - 0.5, t["y1"])):
            m.box(a, a + t["merlon_w"], y0, y1, t["top"], t["battlement"])
    m.box(-t["half_w"], t["half_w"], t["y0"], t["y1"], t["top"], t["top"] + 0.9)
    for sx in (-1, 1):
        for y in (t["y0"] + u["inset"], t["y1"] - u["inset"]):
            m.turret(sx * (t["half_w"] - u["inset"]), y, u["r"], u["base"], u["shoulder"], p["tip"])
    yc = t["y0"] + 0.3
    m.box(-c["w"], c["w"], yc - c["w"], yc + c["w"], c["z0"], c["z1"])
    m.box(-c["arm"], c["arm"], yc - c["w"], yc + c["w"], c["z1"] - 2.6, c["z1"] - 2.0)
    return m


def write(mesh, path):
    with open(path, "w", encoding="ascii") as f:
        f.writelines(f"v {x:.4f} {y:.4f} {z:.4f}\n" for x, y, z in mesh.verts)
        f.writelines("f " + " ".join(map(str, face)) + "\n" for face in mesh.faces)


if __name__ == "__main__":
    mesh = build()
    write(mesh, sys.argv[1])
    print("faces", len(mesh.faces))
