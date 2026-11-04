"""Writes the TouchDesigner script for the terrain, shaped by the real roster in members.json."""
import json, math, os
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = "C:/Users/vedar/MechaEagles-lab/foundation-ending/src/data/"
members = [m for m in json.load(open(DATA + "members.json", encoding="utf8")) if m["status"] == "current"]
TEAMS = ["baja", "aero", "combat-robotics", "ai-safety"]
ANGLE = {"baja": -135, "aero": 135, "combat-robotics": 45, "ai-safety": -45}  # the same places as the platform's cards
count = {t: sum(any(r["org"] == t for r in m["roles"]) for m in members) for t in TEAMS}
pos = {t: (math.cos(math.radians(ANGLE[t]) + 0.5) * 125, -math.sin(math.radians(ANGLE[t]) + 0.5) * 125) for t in TEAMS}
# A ridge joins two places once for each person who works in both. Leadership and Programmatics sit at the middle, with the tower.
links = {}
for m in members:
    orgs = sorted({"centre" if r["org"] in ("leadership", "programmatics") else r["org"] for r in m["roles"]})
    for i, a in enumerate(orgs):
        for b in orgs[i + 1:]:
            links[(a, b)] = links.get((a, b), 0) + 1
print("people per team", count)
print("ridges", links)
P = dict(pos, centre=(0.0, 0.0))
ridges = [(P[a], P[b], n) for (a, b), n in links.items()]
glsl_m = "\n".join(f"  h += massif(p, vec2({pos[t][0]:.2f},{pos[t][1]:.2f}), {10 + count[t] * 1.55:.2f}, {i});" for i, t in enumerate(TEAMS))
glsl_r = "\n".join(f"  h += ridge(p, vec2({a[0]:.2f},{a[1]:.2f}), vec2({b[0]:.2f},{b[1]:.2f}), {n});" for a, b, n in ridges) or ""
frag = f"""
// MechaEagles terrain. World metres, tower at the origin. Each team is a massif whose size is its headcount and whose character is its element.
float hash(vec2 p){{ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }}
vec3 noised(vec2 x){{ vec2 i = floor(x), f = fract(x); vec2 u = f*f*f*(f*(f*6.-15.)+10.), du = 30.*f*f*(f*(f-2.)+1.);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y, du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx)); }}
// Erosion: each octave cuts gullies that run downhill, by following the slope built up so far.
float eroded(vec2 p, float rough){{
  float h = 0., a = 1., norm = 0.; vec2 slope = vec2(0.); mat2 m = mat2(.8,-.6,.6,.8);
  for (int i = 0; i < 9; i++) {{
    vec3 n = noised(p);
    slope += n.yz * a;
    h += a * (n.x - .5) / (1. + rough * dot(slope, slope));
    norm += a; a *= .52; p = m * p * 2.03 + vec2(13.1, 7.7);
  }}
  return h / norm;
}}
float massif(vec2 p, vec2 c, float height, int kind){{
  vec2 q = (p - c) / 46.; float r = length(q);
  float body = exp(-r * r * .62);
  float e = eroded(p * .021 + c, 2.2);
  if (kind == 0) e = abs(e) * 1.5 - .1;                                            // Earth: rugged, broken ground
  if (kind == 1) {{ vec2 w = p * vec2(.009, .034) + .6 * sin(p.yx * .017); e = eroded(w + c, .6) * 1.25; }}  // Wind: long swept ridges
  if (kind == 2) {{ float rim = exp(-pow((r - .72) / .24, 2.)); return height * (body * .34 + rim * .92 + e * body * .55 - .0); }}  // Fire: a caldera
  if (kind == 3) e = floor(e * 9. + body * 4.) / 9. * .9;                          // Mind: terraces, every level considered
  return height * body * (1. + e * 1.25);
}}
float seg(vec2 p, vec2 a, vec2 b){{ vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0., 1.); return length(p - a - ab * t); }}
float ridge(vec2 p, vec2 a, vec2 b, int people){{ float wander = (noised(p * .02).x - .5) * 34.; float d = seg(p, a, b) + wander; return (2.5 + float(people) * 2.2) * exp(-d * d / 220.); }}
out vec4 fragColor;
void main(){{
  vec2 p = (vUV.st - .5) * 620.;
  float r = length(p);
  float h = eroded(p * .0085 + 3., 1.6) * 8.;
{glsl_m}
{glsl_r}
  // The tower stands on a level quad, and the land rises away from it.
  h *= smoothstep(26., 95., r);
  fragColor = TDOutputSwizzle(vec4(h, 0., 0., 1.));
}}
"""
script = f"""
import numpy as np
root = op('/project1')
for n in [c.name for c in root.children if c.name.startswith('t_')]:
    if root.op(n): root.op(n).destroy()
src = root.create(textDAT, 't_frag'); src.text = {frag!r}
g = root.create(glslTOP, 't_height')
g.par.pixeldat = src.path
g.par.outputresolution = 'custom'; g.par.resolutionw = 1024; g.par.resolutionh = 1024
g.par.format = 'r32float'
g.cook(force=True)
print('errors', repr(g.errors()), repr(g.warnings()), repr(src.errors()))
a = g.numpyArray(delayed=False)
print(a.shape, float(a[...,0].min()), float(a[...,0].max()))
np.save(r'{ROOT}/height.npy'.replace(chr(92), '/'), a[...,0])
"""
open(os.path.join(ROOT, "terrain_td.py"), "w", encoding="utf8").write(script)
