"""Involute gear outlines, with no CAD dependency, shared by the model and its mesh check."""
import math


def _inv(a):
    return math.tan(a) - a


def involute_points(teeth, module, pressure_angle, tooth_thickness, r_tip, r_root, steps=9):
    """(x, y) outline with tooth centres at k * pitch. An internal gear's hole uses the same outline, with spaces as "teeth"."""
    rp = module * teeth / 2
    rb = rp * math.cos(pressure_angle)
    half = tooth_thickness / (2 * rp) + _inv(pressure_angle)
    start = max(rb, r_root)
    flank = []
    for i in range(steps + 1):
        r = start + (r_tip - start) * i / steps
        flank.append((r, half - _inv(math.acos(min(1.0, rb / r)))))
    if r_root < rb:
        flank.insert(0, (r_root, half))
    pts = []
    for k in range(teeth):
        c = k * math.tau / teeth
        pts += [(r * math.cos(c - a), r * math.sin(c - a)) for r, a in flank]
        pts += [(r * math.cos(c + a), r * math.sin(c + a)) for r, a in reversed(flank)]
    return pts
