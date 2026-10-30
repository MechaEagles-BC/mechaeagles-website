"""Measures the ring gear against a pinion across one tooth pitch, using the phase formula the runtime uses.
Works on the 2D tooth profiles: overlap should be 0 at every phase, with a small clearance and no gap wider than backlash needs.
Run: uv run --no-project --with shapely python cad/check_mesh.py"""
import math

from shapely import affinity
from shapely.geometry import Point, Polygon

from gear_math import involute_points

RING_TEETH, PINION_TEETH, RING_PITCH_R = 120, 16, 4300.0
MODULE = 2 * RING_PITCH_R / RING_TEETH
PINION_PITCH_R = MODULE * PINION_TEETH / 2
CENTRE = RING_PITCH_R - PINION_PITCH_R
ANGLE = math.radians(20)
BACKLASH = 0.04 * MODULE

hole = Polygon(involute_points(RING_TEETH, MODULE, ANGLE, math.pi * MODULE / 2 + BACKLASH, RING_PITCH_R + 1.25 * MODULE, RING_PITCH_R - 0.8 * MODULE))
ring = Point(0, 0).buffer(5540, 256).difference(hole)
pin = Polygon(involute_points(PINION_TEETH, MODULE, ANGLE, math.pi * MODULE / 2 - BACKLASH, PINION_PITCH_R + MODULE, PINION_PITCH_R - 1.25 * MODULE))
ratio = RING_TEETH / PINION_TEETH
pitch = 360 / RING_TEETH
worst = 0.0
for i in range(17):
    psi = pitch * i / 16
    phi = psi * ratio  # phi = theta + (psi - theta) * ratio, at theta = 0
    r = affinity.rotate(ring, psi, origin=(0, 0))
    p = affinity.translate(affinity.rotate(pin, phi, origin=(0, 0)), CENTRE, 0)
    area = r.intersection(p).area
    worst = max(worst, area)
    print(f"psi {psi:5.3f} deg  overlap {area:9.2f} mm2  clearance {r.distance(p):6.2f} mm")
print(f"worst overlap {worst:.2f} mm2; pinion tooth area {pin.area / PINION_TEETH:.0f} mm2; module {MODULE:.2f} mm; backlash {BACKLASH:.2f} mm")
