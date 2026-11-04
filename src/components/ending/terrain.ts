/**
 * The land of the living map, drawn once per visit on the visitor's graphics card. Each team is a massif whose size is its headcount and whose character is its element,
 * and a ridge joins two places once for each person who works in both. The numbers come from members.json at build time, so the land follows the roster by itself.
 */
import * as THREE from "three";
import { TEAMS } from "../teams";

/** Built by `terrainOf()` in data/org.ts: headcount per team id, and ridges between team ids or "centre", with how many people share them. */
export type Terrain = { teams: Record<string, number>; ridges: [string, string, number][] };

export const LAND_SIZE = 620; // metres across, with the tower at the middle
export const MASSIF_RADIUS = 125;
const TEXELS = 512;
const MAX_RIDGES = 10;

/** Where each team's massif stands: the same places as its card on the platform. */
export const massifAt = (angle: number) => new THREE.Vector2(Math.cos(angle + 0.5) * MASSIF_RADIUS, -Math.sin(angle + 0.5) * MASSIF_RADIUS);
const idOf = (href: string) => href.split("/").filter(Boolean).pop()!;
/** A massif's height in metres, from its headcount. */
export const massifHeight = (people: number) => 10 + people * 1.55;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 uMassif[4]; uniform float uMassifH[4];
  uniform vec4 uRidge[${MAX_RIDGES}]; uniform float uRidgePeople[${MAX_RIDGES}]; uniform int uRidges;
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec3 noised(vec2 x){ vec2 i = floor(x), f = fract(x); vec2 u = f*f*f*(f*(f*6.-15.)+10.), du = 30.*f*f*(f*(f-2.)+1.);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y, du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx)); }
  // Erosion: each octave cuts gullies that run downhill, by following the slope built up so far.
  float eroded(vec2 p, float rough){
    float h = 0., a = 1., norm = 0.; vec2 slope = vec2(0.); mat2 m = mat2(.8,-.6,.6,.8);
    for (int i = 0; i < 9; i++) { vec3 n = noised(p); slope += n.yz * a; h += a * (n.x - .5) / (1. + rough * dot(slope, slope)); norm += a; a *= .52; p = m * p * 2.03 + vec2(13.1, 7.7); }
    return h / norm;
  }
  float massif(vec2 p, vec2 c, float height, int kind){
    vec2 q = (p - c) / 46.; float r = length(q);
    float body = exp(-r * r * .62);
    float e = eroded(p * .021 + c, 2.2);
    if (kind == 0) e = abs(e) * 1.5 - .1;                                                                     // Earth: rugged, broken ground
    if (kind == 1) { vec2 w = p * vec2(.009, .034) + .6 * sin(p.yx * .017); e = eroded(w + c, .6) * 1.25; }   // Wind: long swept ridges
    if (kind == 2) { float rim = exp(-pow((r - .72) / .24, 2.)); return height * (body * .34 + rim * .92 + e * body * .55); }  // Fire: a caldera
    if (kind == 3) e = floor(e * 9. + body * 4.) / 9. * .9;                                                   // Mind: terraces
    return height * body * (1. + e * 1.25);
  }
  float seg(vec2 p, vec2 a, vec2 b){ vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0., 1.); return length(p - a - ab * t); }
  float ridge(vec2 p, vec2 a, vec2 b, float people){ float wander = (noised(p * .02).x - .5) * 34.; float d = seg(p, a, b) + wander; return (2.5 + people * 2.2) * exp(-d * d / 220.); }
  void main(){
    vec2 p = (vUv - .5) * ${LAND_SIZE}.;
    float h = eroded(p * .0085 + 3., 1.6) * 8.;
    for (int i = 0; i < 4; i++) h += massif(p, uMassif[i], uMassifH[i], i);
    for (int i = 0; i < ${MAX_RIDGES}; i++) { if (i >= uRidges) break; h += ridge(p, uRidge[i].xy, uRidge[i].zw, uRidgePeople[i]); }
    // The tower stands on a level quad, and the land rises away from it.
    h *= smoothstep(26., 95., length(p));
    gl_FragColor = vec4(h, 0., 0., 1.);
  }`;

/**
 * Draws the land into a texture of heights in metres: one draw, then it's only read. Its shader compiles in the background first, so starting the map never stalls scrolling.
 * Cached per renderer, so the component can wait on it like any other asset.
 */
const drawn = new WeakMap<THREE.WebGLRenderer, Promise<THREE.WebGLRenderTarget>>();
export function terrainFor(gl: THREE.WebGLRenderer, terrain: Terrain) {
  let ready = drawn.get(gl);
  if (!ready) {
    ready = drawTerrain(gl, terrain);
    drawn.set(gl, ready);
  }
  return ready;
}

async function drawTerrain(gl: THREE.WebGLRenderer, terrain: Terrain) {
  const place = (id: string) => (id === "centre" ? new THREE.Vector2() : massifAt(TEAMS.find((t) => idOf(t.href) === id)?.angle ?? 0));
  const ridges = terrain.ridges.slice(0, MAX_RIDGES);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMassif: { value: TEAMS.map((t) => massifAt(t.angle)) },
      uMassifH: { value: TEAMS.map((t) => massifHeight(terrain.teams[idOf(t.href)] ?? 0)) },
      uRidge: { value: Array.from({ length: MAX_RIDGES }, (_, i) => (ridges[i] ? new THREE.Vector4(...place(ridges[i][0]).toArray(), ...place(ridges[i][1]).toArray()) : new THREE.Vector4())) },
      uRidgePeople: { value: Array.from({ length: MAX_RIDGES }, (_, i) => ridges[i]?.[2] ?? 0) },
      uRidges: { value: ridges.length },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const target = new THREE.WebGLRenderTarget(TEXELS, TEXELS, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const camera = new THREE.Camera();
  await gl.compileAsync(quad, camera);
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  gl.render(quad, camera);
  gl.setRenderTarget(previous);
  quad.geometry.dispose();
  material.dispose();
  return target;
}
