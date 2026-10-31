"""The landscape height function, shared by the terrain builder and the model placement. Needs only numpy."""
import numpy as np

rng = np.random.default_rng(23)
LAT = rng.random((512, 512))


def noise(x, y):
    """Smooth value noise, tiling at 512 cells, at any coordinates."""
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    g = lambda i, j: LAT[(j + iy) % 512, (i + ix) % 512]
    return (g(0, 0) * (1 - fx) + g(1, 0) * fx) * (1 - fy) + (g(0, 1) * (1 - fx) + g(1, 1) * fx) * fy


def fbm(x, y, octaves, gain=0.5):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + amp * noise(x * 2**o + o * 37.0, y * 2**o - o * 11.0)
        norm += amp
        amp *= gain
    return total / norm


def smooth(a, b, t):
    k = np.clip((t - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def path_centre(y):
    """The path leaves the back of the platform and bends away to the right, out of sight behind a grove."""
    return 30 * smooth(11, 85, y) ** 1.6


def height(x, y):
    r = np.hypot(x, y)
    rolling = (fbm(x / 170, y / 170, 3) - 0.42) * 40 * smooth(20, 130, r)
    swell = (fbm(x / 26, y / 26, 2) - 0.5) * 1.2 * smooth(11, 28, r)
    # the valley opens toward the back, then climbs into far ranges
    climb = smooth(250, 2600, y) * 150 * (0.6 + fbm(x / 900, y / 900, 3))
    ridge = 1 - np.abs(fbm(x / 1300, y / 1300, 5, 0.55) * 2 - 1)
    peaks = smooth(1500, 6000, y) * ridge**1.2 * 340  # soft blue ranges, as in the pack's own scenes
    sides = smooth(70, 900, np.abs(x)) * smooth(-120, 400, y) * 95 * fbm(x / 300, y / 300, 4)
    return rolling + swell + climb + peaks + sides
