"""The small moon's shape and colour, and where the sky backdrop sits. Shared by the terrain builder, the placement and the sky painter. Needs only numpy."""
import numpy as np

from land_height import fbm, smooth

# Must match CAM_POS and CAM_LOOK in land_build.py, in x, depth, up.
CAM = np.array([0.0, -25.0, 8.4])
LOOK = np.array([0.0, 0.0, 3.3])
SKY_DISTANCE = 9000.0
# The backdrop in film units, where 1 is the tangent of the angle from the lens axis. It covers the wide and tall plates.
SKY_U = (-0.9, 0.9)
SKY_V = (-0.8, 1.5)
# A curve front to back brings the horizon to the middle of the window, so half of it is sky. A steeper curve across makes it read as a dome.
CURVE_BACK = 300.0
CURVE_SIDE = 190.0
CRATERS = ((-27, 36, 8.5), (19, 24, 3.6), (48, 66, 11), (-6, 52, 5), (-58, 74, 9), (2, 32, 2.2), (-19, 15, 2.6), (-15, -13.5, 3.4), (16, -12.5, 2.6), (6, -17, 1.5), (-5.5, -19, 1.1))


def linear(c):
    return np.array([((v + 0.055) / 1.055) ** 2.4 if v > 0.04 else v / 12.92 for v in c])


def crater_field(x, y):
    """Returns the height change, and how far each point is up a crater's lit rim."""
    change, rim = np.zeros_like(x, dtype=float), np.zeros_like(x, dtype=float)
    for cx, cy, r in CRATERS:
        d = np.hypot(x - cx, y - cy) / r
        bowl = -(1 - np.minimum(d, 1) ** 2) * r * 0.26
        lip = np.exp(-(((d - 1) / 0.2) ** 2)) * r * 0.11
        change += bowl + lip
        rim = np.maximum(rim, np.exp(-(((d - 1) / 0.16) ** 2)))
    return change, rim


def height(x, y):
    r = np.hypot(x, y)
    # The ground is level under the platform and starts to curve past the rim.
    k = smooth(13, 34, r)
    dome = (x * k) ** 2 / (2 * CURVE_SIDE) + (y * k) ** 2 / (2 * CURVE_BACK)
    roll = (fbm(x / 34 + 30, y / 34, 3) - 0.5) * 3.2 * smooth(12, 40, r)
    fine = (fbm(x / 4 + 11, y / 4, 4, 0.6) - 0.5) * 0.62 * smooth(9.5, 16, r)
    bowl, _ = crater_field(x, y)
    return roll + fine + bowl - dome


def colours(x, y):
    # Close values, so the ground stays one calm mass: its shape comes from the sun on the craters, not from painted blotches.
    dust = linear((0.3, 0.305, 0.315))
    pale = linear((0.4, 0.4, 0.405))
    dark = linear((0.23, 0.235, 0.25))
    a = smooth(0.32, 0.68, fbm(x / 60 + 5, y / 60, 2))[..., None]
    b = smooth(0.35, 0.65, fbm(x / 1.6, y / 1.6, 4, 0.65))[..., None]
    c = dust * (1 - a) + dark * a
    c = c * (0.86 + b * 0.28)
    _, rim = crater_field(x, y)
    return c * (1 - rim[..., None] * 0.55) + pale * rim[..., None] * 0.55


def lens_axes():
    f = (LOOK - CAM) / np.linalg.norm(LOOK - CAM)
    r = np.cross(f, np.array([0.0, 0.0, 1.0]))
    r = r / np.linalg.norm(r)
    return f, r, np.cross(r, f)


def sky_point(u, v):
    f, r, up = lens_axes()
    return CAM + (f + r * u + up * v) * SKY_DISTANCE


def world_at_film(u, v, distance):
    """The point at a given distance along the lens axis that shows at film position u, v, for placing things in the sky."""
    f, r, up = lens_axes()
    return CAM + (f + r * u + up * v) * distance
