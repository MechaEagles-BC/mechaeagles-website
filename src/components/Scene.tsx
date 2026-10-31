/**
 * The live foundation. Parts are parametric CAD from cad/foundation.py, with shadowing baked in cad/prep.py.
 * Illustrative machinery, not team hardware. Gear speeds and phase follow the tooth counts; see cad/check_mesh.py.
 */
import { memo, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, PerformanceMonitor, useEnvironment, useGLTF, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { ADDITIVE } from "./additive";
import Grass from "./Grass";
import { Fleet, Regolith } from "./Space";
import { Birds, FallingLeaves, Signpost, Trees } from "./Valley";
import { FILM, filmFit, PORTAL, TEAMS, type Fx, type World } from "./teams";
import Hologram from "./Hologram";
import Portal from "./Portal";

const BASE = "/models/foundation/";
const PARTS = ["plinth", "deck_plate", "bearing_panel", "ring_gear", "pinion", "shaft", "fin_ring", "collar", "spar", "post", "coupler"] as const;
const SCREW = "cap_screw";
type Part = (typeof PARTS)[number];

const RING_TEETH = 120;
const PINION_TEETH = 16;
const GEAR_RATIO = RING_TEETH / PINION_TEETH;
const PINION_CENTRE = 3.72667;
const PINION_ANGLES = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const GROOVES: [number, number][] = [[7.07, 7.02], [5.68, 5.63], [3.07, 3.04]];
const SPAR_OUT = 8.1;
const SPAR_IN = 2.7;
const PULSE_SECONDS = 0.85;
const RIPPLE_SECONDS = 1.5;
const TAU = Math.PI * 2;
const DUCT_SHARE = 0.22;
// Portrait screens get stacked team cards in Stage 7, so their poster leaves the panels out rather than cropping them.
const PORTALS_ON = !(import.meta.env.DEV && new URLSearchParams(location.search).has("noportal"));
// Each duct runs from a coupler's outer end down to the foot of its portal.
const DUCTS = TEAMS.map((t) => {
  const from = new THREE.Vector3(Math.cos(t.angle) * 9.2, 0.46, -Math.sin(t.angle) * 9.2);
  const foot = new THREE.Vector3(Math.cos(t.portalAngle) * PORTAL.radius, 0.05, -Math.sin(t.portalAngle) * PORTAL.radius);
  const to = foot.add(from.clone().setY(0.05).sub(foot).normalize().multiplyScalar(0.95));
  return {
    length: from.distanceTo(to),
    mid: from.clone().add(to).multiplyScalar(0.5),
    turn: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), to.clone().sub(from).normalize()),
  };
});
const Y = new THREE.Vector3(0, 1, 0);

// ---------- shared light state ----------
export type SharedLight = typeof shared;
const shared = {
  uTime: { value: 0 },
  uWave: { value: -1 },
  uWaveAmp: { value: 0 },
  uAccent: { value: new THREE.Color("#ffffff") },
};

// ---------- machined metal ----------
type Finish = { color: string; roughness: number; metalness?: number; turned?: number; blast?: number; scale?: boolean; wear?: number; stencil?: 1 | 2 };

// ---------- markings, drawn once from the typeface the page already uses ----------
function makeMarkings() {
  const font = (px: number) => `500 ${px}px "IBM Plex Mono", Consolas, monospace`;
  const scaleCanvas = document.createElement("canvas");
  scaleCanvas.width = 8192;
  scaleCanvas.height = 96;
  const stencilCanvas = document.createElement("canvas");
  stencilCanvas.width = stencilCanvas.height = 1024;
  const scaleTex = new THREE.CanvasTexture(scaleCanvas);
  const stencilTex = new THREE.CanvasTexture(stencilCanvas);
  scaleTex.wrapS = THREE.RepeatWrapping;
  scaleTex.anisotropy = stencilTex.anisotropy = 8;
  const draw = () => {
    const g = scaleCanvas.getContext("2d")!;
    g.clearRect(0, 0, 8192, 96);
    g.fillStyle = "#fff";
    g.font = font(58);
    g.textAlign = "center";
    g.textBaseline = "middle";
    // A strip pixel is about 3.7 mm around the ring but 1.15 mm across it, so letters are drawn narrow to read true.
    for (let deg = 0; deg < 360; deg += 15) {
      g.save();
      g.translate((deg / 360) * 8192, 50);
      g.scale(0.32, 1);
      g.fillText(String(deg).padStart(3, "0"), 0, 0);
      g.restore();
    }
    const c = stencilCanvas.getContext("2d")!;
    c.clearRect(0, 0, 1024, 1024);
    c.fillStyle = "#fff";
    c.font = font(44);
    c.textAlign = "center";
    c.textBaseline = "middle";
    // 4 columns by 16 rows: 24 bearing panels, then 32 deck plates
    for (let i = 0; i < 56; i++) {
      const label = i < 24 ? `BR-${String(i + 1).padStart(2, "0")}` : `DK-${String(i - 23).padStart(2, "0")}`;
      c.fillText(label, ((i % 4) + 0.5) * 256, (Math.floor(i / 4) + 0.5) * 64);
    }
    scaleTex.needsUpdate = stencilTex.needsUpdate = true;
  };
  draw();
  document.fonts?.load(font(44)).then(draw);
  return { scaleTex, stencilTex };
}
const markings = { current: null as null | ReturnType<typeof makeMarkings> };

const NOISE = /* glsl */ `
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

/** Standard PBR plus finish detail computed in part space, so it needs no UVs, never tiles and fades out before it can shimmer. */
export function machined({ color, roughness, metalness = 1, turned = 0, blast = 0, scale = false, wear = 0, stencil }: Finish, ao?: THREE.Texture) {
  markings.current ??= makeMarkings();
  const { scaleTex, stencilTex } = markings.current;
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, aoMap: ao ?? null, aoMapIntensity: 0.9 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    s.uniforms.uTurned = { value: turned };
    s.uniforms.uBlast = { value: blast };
    s.uniforms.uScale = { value: scale ? 1 : 0 };
    s.uniforms.uWear = { value: wear };
    s.uniforms.uStencilKind = { value: stencil ?? 0 };
    s.uniforms.uScaleTex = { value: scaleTex };
    s.uniforms.uStencilTex = { value: stencilTex };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPart; varying vec3 vWorld; varying float vInst;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vPart = position;
         vInst = 0.0;
         #ifdef USE_INSTANCING
           vInst = float(gl_InstanceID);
           vWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
         #else
           vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
         #endif`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vPart; varying vec3 vWorld; varying float vInst;
         uniform float uTurned, uBlast, uScale, uWear, uStencilKind, uTime, uWave, uWaveAmp; uniform vec3 uAccent;
         uniform sampler2D uScaleTex, uStencilTex;
         ${NOISE}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         float partR = length(vPart.xz);
         float partA = atan(vPart.z, vPart.x);
         float fadeT = 1.0 - smoothstep(0.15, 0.7, fwidth(partR) * 420.0);
         float fadeB = 1.0 - smoothstep(0.2, 0.8, length(fwidth(vPart)) * 260.0);
         float rings = vnoise(vec3(partR * 420.0, 3.1, 0.0)) * 0.7 + vnoise(vec3(partR * 150.0, 7.7, 0.0)) * 0.3;
         float grain = vnoise(vPart * 340.0);
         float wear = vnoise(vPart * 2.4);
         roughnessFactor = clamp(roughnessFactor + uTurned * (rings - 0.5) * 0.14 * fadeT + uBlast * (grain - 0.5) * 0.2 * fadeB + (wear - 0.5) * 0.09, 0.08, 1.0);
         float etch = 0.0;
         if (uScale > 0.5) {
           float deg = (partA + PI) * 180.0 / PI;
           float fine = 1.0 - smoothstep(0.0, 0.045, abs(fract(deg / 3.0 + 0.5) - 0.5) * 3.0);
           float major = 1.0 - smoothstep(0.0, 0.07, abs(fract(deg / 15.0 + 0.5) - 0.5) * 15.0);
           float band = step(4.94, partR) * step(partR, 5.02);
           float longBand = step(4.86, partR) * step(partR, 5.02);
           float rNum = (4.86 - partR) / 0.11;
           // The angle wraps at the seam, so its derivative comes from a coordinate that doesn't.
           vec2 numUv = vec2(1.0 - fract(partA / 6.2831853 + 1.0), rNum);
           vec2 dx = vec2(fwidth(partR) / 4.8 / 6.2831853, dFdx(rNum));
           vec2 dy = vec2(fwidth(partR) / 4.8 / 6.2831853, dFdy(rNum));
           float numerals = textureGrad(uScaleTex, numUv, dx, dy).r * step(0.0, rNum) * step(rNum, 1.0);
           etch = max(max(fine * band, major * longBand), numerals) * step(0.28, vPart.y);
           roughnessFactor = mix(roughnessFactor, 0.9, etch);
         }
         // stamped identifiers, read from outside the platform
         float paint = 0.0;
         if (uStencilKind > 0.5) {
           bool panel = uStencilKind < 1.5;
           float index = panel ? vInst : vInst + 24.0;
           vec2 box = panel ? vec2(0.7, 0.175) : vec2(0.5, 0.125);
           vec2 origin = panel ? vec2(-0.35, 6.27) : vec2(0.09, 8.14);
           vec2 uv = vec2((origin.x + box.x - vPart.z) / box.x, (origin.y + box.y - vPart.x) / box.y);
           bool onFace = panel ? vPart.y > 0.62 : (vPart.y > 0.44 && vPart.y < 0.46);
           vec2 cellBase = vec2(mod(index, 4.0), 15.0 - floor(index / 4.0));
           vec2 scaleUv = vec2(4.0, 16.0);
           float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0) * (onFace ? 1.0 : 0.0);
           float letters = textureGrad(uStencilTex, (cellBase + clamp(uv, 0.0, 1.0)) / scaleUv, dFdx(uv) / scaleUv, dFdy(uv) / scaleUv).r;
           paint = inside * letters * (0.55 + 0.45 * smoothstep(0.3, 0.6, vnoise(vPart * 90.0)));
           roughnessFactor = mix(roughnessFactor, 0.85, paint);
         }
         // coatings wear back to bare metal on convex edges, broken up so the wear never reads as an outline
         #ifdef USE_AOMAP
           float edgeMask = texture2D(aoMap, vAoMapUv).g;
         #else
           float edgeMask = 0.0;
         #endif
         float wearBreak = vnoise(vPart * 11.0) * 0.55 + vnoise(vPart * 47.0) * 0.45;
         float worn = smoothstep(0.3, 0.7, edgeMask) * smoothstep(0.42, 0.68, wearBreak) * uWear * fadeB;
         roughnessFactor = mix(roughnessFactor, 0.4, worn);`,
      )
      .replace("#include <color_fragment>", "#include <color_fragment>\n")
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
         metalnessFactor = mix(metalnessFactor, 0.2, etch);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), etch);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.61, 0.63), worn);
         metalnessFactor = mix(metalnessFactor, 1.0, worn);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.66), paint);
         metalnessFactor = mix(metalnessFactor, 0.05, paint);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float worldR = length(vWorld.xz);
         float rip = exp(-pow((worldR - uWave) / 0.7, 2.0)) * uWaveAmp;
         totalEmissiveRadiance += uAccent * rip * 0.16;`,
      );
  };
  m.customProgramCacheKey = () => "machined";
  return m;
}

// ---------- emissive shaders ----------
const VERT = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function grooveMaterial(level: number, speed: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color("#a9cdf5") }, uLevel: { value: level }, uSpeed: { value: speed } },
    vertexShader: VERT,
    fragmentShader: `
      uniform float uTime, uWave, uWaveAmp, uLevel, uSpeed; uniform vec3 uColor, uAccent; varying vec3 vP;
      void main(){
        float a = atan(vP.z, vP.x), r = length(vP.xz);
        float slow = 0.75 + 0.25 * sin(a * 3.0 - uTime * 0.3);
        float run = pow(0.5 + 0.5 * sin(a * 2.0 - uTime * uSpeed), 60.0) * 1.6;
        float ripple = exp(-pow((r - uWave) / 0.42, 2.0)) * uWaveAmp * 4.0;
        gl_FragColor = vec4(uColor * (uLevel * slow + run * uLevel * 2.5) + uAccent * ripple, 1.0);
      }`,
  });
}

function projectionMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color("#8fbdf0") } },
    vertexShader: VERT,
    fragmentShader: `
      uniform float uTime, uWave, uWaveAmp; uniform vec3 uColor, uAccent; varying vec3 vP;
      void main(){
        float r = length(vP.xz), a = atan(vP.z, vP.x);
        float w = fwidth(r * 7.0);
        float lines = (1.0 - smoothstep(0.03, 0.03 + w, abs(fract(r * 7.0) - 0.5))) * 0.16;
        float s = abs(fract(a * 18.0 / 6.2831853) - 0.5);
        float spokes = (1.0 - smoothstep(0.012, 0.012 + fwidth(a * 18.0 / 6.2831853), s)) * smoothstep(0.7, 1.0, r) * 0.09;
        float falloff = mix(0.5, 1.0, smoothstep(0.0, 2.2, r));
        float scan = exp(-pow((r - mod(uTime * 0.28, 2.6)) / 0.12, 2.0)) * 0.3;
        float ripple = exp(-pow((r - uWave) / 0.38, 2.0)) * uWaveAmp * 3.0;
        vec3 c = uColor * (0.018 + (lines + spokes) * falloff * 1.7 + scan * 0.6) + uAccent * ripple;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function ductLineMaterial(color: string, length: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uHead: { value: -1 }, uLift: { value: 0 }, uHeld: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform float uHead, uLift, uHeld; uniform vec3 uColor; varying vec3 vP;
      void main(){
        float t = (${(length / 2).toFixed(3)} - vP.x) / ${length.toFixed(3)};
        float x = (t - uHead) / 0.09;
        float head = exp(-x * x) * 5.0;
        gl_FragColor = vec4(uColor * (0.22 + uLift * 0.8 + uHeld * 0.5 + head), 1.0);
      }`,
  });
}

function sparLineMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uHead: { value: -1 }, uLift: { value: 0 }, uHeld: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform float uHead, uLift, uHeld; uniform vec3 uColor; varying vec3 vP;
      void main(){
        float t = (${SPAR_OUT.toFixed(2)} - vP.x) / ${(SPAR_OUT - SPAR_IN).toFixed(2)};
        float head = exp(-pow((t - uHead) / 0.035, 2.0)) * 5.0;
        float trail = smoothstep(uHead - 0.28, uHead, t) * step(t, uHead) * 0.7;
        gl_FragColor = vec4(uColor * (0.22 + uLift * 0.8 + uHeld * 0.5 + head + trail), 1.0);
      }`,
  });
}

// ---------- assets ----------
export function usePartGeometry(name: string) {
  const { scene } = useGLTF(`${BASE}${name}.glb`, false, true);
  return useMemo(() => {
    let found: THREE.BufferGeometry | null = null;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || found) return;
      // Compressed parts store quantized attributes scaled by their node, so expand to floats before applying it.
      const g = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const a = mesh.geometry.getAttribute(name);
        if (!a) continue;
        const out = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
      }
      g.setIndex(mesh.geometry.getIndex());
      found = g.applyMatrix4(mesh.matrixWorld);
    });
    return found as unknown as THREE.BufferGeometry;
  }, [scene]);
}

function useAssets() {
  const geo = Object.fromEntries(PARTS.map((p) => [p, usePartGeometry(p)])) as Record<Part, THREE.BufferGeometry>;
  const screw = usePartGeometry(SCREW);
  const ao = useTexture(Object.fromEntries(PARTS.map((p) => [p, `${BASE}${p}.ao.webp`]))) as Record<Part, THREE.Texture>;
  useMemo(() => {
    Object.values(ao).forEach((t) => {
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
    });
  }, []);
  const mats = useMemo(
    () => ({
      plinth: machined({ color: "#44484f", roughness: 0.66, metalness: 0.95, blast: 1 }, ao.plinth),
      deck_plate: machined({ color: "#5c6168", roughness: 0.62, metalness: 0.98, blast: 1, wear: 0.45, stencil: 2 }, ao.deck_plate),
      bearing_panel: machined({ color: "#858a92", roughness: 0.5, blast: 0.8, wear: 0.4, stencil: 1 }, ao.bearing_panel),
      ring_gear: machined({ color: "#858a92", roughness: 0.5, turned: 1, scale: true }, ao.ring_gear),
      pinion: machined({ color: "#b3b7bd", roughness: 0.42, turned: 1 }, ao.pinion),
      shaft: machined({ color: "#2b2d31", roughness: 0.4 }, ao.shaft),
      fin_ring: machined({ color: "#8a8e95", roughness: 0.44, turned: 0.8 }, ao.fin_ring),
      collar: machined({ color: "#8e9299", roughness: 0.42, turned: 1 }, ao.collar),
      spar: machined({ color: "#6a6f77", roughness: 0.56, blast: 1, wear: 0.45 }, ao.spar),
      post: machined({ color: "#b1b5bb", roughness: 0.36, turned: 0.6 }, ao.post),
      coupler: machined({ color: "#585c64", roughness: 0.58, metalness: 0.98, blast: 1, wear: 0.5 }, ao.coupler),
      screw: new THREE.MeshStandardMaterial({ color: "#4a4c51", metalness: 0.95, roughness: 0.4 }),
    }),
    // useTexture returns a new record each render; the cached textures inside it never change
    [],
  );
  return { geo, screw, mats };
}
PARTS.forEach((p) => useGLTF.preload(`${BASE}${p}.glb`, false, true));
useGLTF.preload(`${BASE}${SCREW}.glb`, false, true);

// ---------- placement ----------
const polarMatrix = (angle: number, radius = 0, y = 0, scale = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(Math.cos(angle) * radius, y, -Math.sin(angle) * radius),
    new THREE.Quaternion().setFromAxisAngle(Y, angle),
    new THREE.Vector3(scale, scale, scale),
  );
const repeat = (count: number, fn: (angle: number, i: number) => THREE.Matrix4) => Array.from({ length: count }, (_, i) => fn((i / count) * TAU, i));

export function Instanced({ geometry, material, matrices, receive = true }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; receive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current!;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, geometry, material]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow receiveShadow={receive} />;
}

function screwRing(plateCount: number, sweepDeg: number, radii: number[], y: number) {
  const a = THREE.MathUtils.degToRad(sweepDeg / 2 - 0.8);
  const out: THREE.Matrix4[] = [];
  for (let i = 0; i < plateCount; i++) {
    const base = (i / plateCount) * TAU;
    for (const r of radii) for (const d of [-a, 0, a]) out.push(polarMatrix(base + d, r, y));
  }
  return out;
}

// ---------- the machine ----------
function Platform({ fx, labelRefs, onHover, onSelect, onReady }: { fx: RefObject<Fx>; labelRefs: RefObject<HTMLAnchorElement | null>[]; onHover: (i: number) => void; onSelect: (i: number) => void; onReady: () => void }) {
  const { geo, screw, mats } = useAssets();

  const place = useMemo(
    () => ({
      deck: repeat(32, (a) => polarMatrix(a)),
      panels: repeat(24, (a) => polarMatrix(a)),
      deckScrews: screwRing(32, 360 / 32, [9.085, 7.295], 0.436),
      panelScrews: screwRing(24, 15, [6.855, 5.865], 0.606),
      gearScrews: repeat(36, (a) => polarMatrix(a + TAU / 72, 5.2, 0.619)),
      collarScrews: repeat(24, (a) => polarMatrix(a + TAU / 48, 2.375, 0.658, 0.6)),
      couplerScrews: TEAMS.flatMap((t) =>
        [[-0.42, -0.5], [-0.42, 0.5], [0.29, -0.5], [0.29, 0.5]].map(([x, z]) => {
          const m = new THREE.Matrix4().makeRotationY(t.angle);
          return m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(8.6 + x, 1.002, z), new THREE.Quaternion(), new THREE.Vector3(0.85, 0.85, 0.85)));
        }),
      ),
    }),
    [],
  );

  const emissive = useMemo(
    () => ({
      grooves: [grooveMaterial(0.8, 0.7), grooveMaterial(0.6, -0.5), grooveMaterial(0.8, 1.0)],
      surface: projectionMaterial(),
      lines: TEAMS.map((t) => sparLineMaterial(t.color)),
      ducts: TEAMS.map((t, i) => ductLineMaterial(t.color, DUCTS[i].length)),
      lamps: TEAMS.map((t) => new THREE.MeshBasicMaterial({ color: new THREE.Color(t.color).multiplyScalar(0.6), toneMapped: false })),
    }),
    [],
  );
  const shapes = useMemo(
    () => ({
      grooves: GROOVES.map(([o, i]) => new THREE.RingGeometry(i, o, 256).rotateX(-Math.PI / 2)),
      surface: new THREE.CircleGeometry(2.25, 128).rotateX(-Math.PI / 2),
      sparLine: new THREE.BoxGeometry(SPAR_OUT - SPAR_IN - 0.26, 0.004, 0.036).translate((SPAR_OUT + SPAR_IN) / 2, 0, 0),
      lamp: new THREE.BoxGeometry(0.075, 0.012, 0.76),
      ducts: DUCTS.map((d) => new THREE.BoxGeometry(d.length, 0.1, 0.28)),
      ductLines: DUCTS.map((d) => new THREE.BoxGeometry(d.length - 0.12, 0.004, 0.05)),
    }),
    [],
  );

  const outerRef = useRef<THREE.Group>(null);
  const gearRef = useRef<THREE.Group>(null);
  const finRef = useRef<THREE.Group>(null);
  const leanRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const holoRef = useRef<THREE.Group>(null);
  const pinionRefs = useRef<(THREE.Group | null)[]>([]);
  const glow = useRef<THREE.PointLight>(null);
  const rot = useRef({ outer: 0, gear: 0, fin: 0 });
  const ready = useRef(0);

  useFrame((state, rawDt) => {
    if (ready.current < 3 && ++ready.current === 3) onReady();
    const dt = Math.min(rawDt, 0.05);
    const f = fx.current!;
    shared.uTime.value = state.clock.elapsedTime;

    f.boost = THREE.MathUtils.damp(f.boost, 0, 1.4, dt);
    const speed = 1 + f.boost * 7;
    rot.current.outer += 0.018 * speed * dt;
    rot.current.gear -= 0.03 * speed * dt;
    rot.current.fin += 0.055 * speed * dt;
    outerRef.current!.rotation.y = rot.current.outer;
    gearRef.current!.rotation.y = rot.current.gear;
    finRef.current!.rotation.y = rot.current.fin;
    PINION_ANGLES.forEach((theta, i) => {
      const pin = pinionRefs.current[i];
      if (pin) pin.rotation.y = theta + (rot.current.gear - theta) * GEAR_RATIO;
    });

    leanRef.current!.rotation.x = THREE.MathUtils.damp(leanRef.current!.rotation.x, state.pointer.y * -0.008, 2.2, dt);
    leanRef.current!.rotation.z = THREE.MathUtils.damp(leanRef.current!.rotation.z, state.pointer.x * -0.008, 2.2, dt);

    if (f.pulse >= 0) {
      f.pulseT += dt / PULSE_SECONDS;
      if (f.pulseT >= 1) {
        f.pulse = -1;
        f.rippleT = 0;
        f.boost = 1;
      }
    }
    if (f.rippleT >= 0) {
      f.rippleT += dt / RIPPLE_SECONDS;
      const k = f.rippleT;
      shared.uWave.value = k * 9;
      shared.uWaveAmp.value = Math.max(0, 1 - k) * 0.9;
      if (k >= 1) {
        f.rippleT = -1;
        shared.uWave.value = -1;
        shared.uWaveAmp.value = 0;
      }
    }
    if (f.held >= 0) shared.uAccent.value.set(TEAMS[f.held].color);
    // Follows a drag closely, and settles home slowly.
    f.spin = THREE.MathUtils.damp(f.spin, f.spinGoal, f.dragging ? 16 : 2.4, dt);
    spinRef.current!.rotation.y = f.spin;
    holoRef.current!.rotation.copy(leanRef.current!.rotation);
    emissive.lines.forEach((mat, i) => {
      const u = mat.uniforms;
      const heldNow = f.held === i && f.pulse !== i ? 1 : 0;
      const lift = f.lit || f.hover === i ? 1 : f.hover >= 0 || f.held >= 0 ? -0.09 : 0;
      u.uLift.value = THREE.MathUtils.damp(u.uLift.value, lift, 9, dt);
      u.uHeld.value = THREE.MathUtils.damp(u.uHeld.value, heldNow, 6, dt);
      // The pulse starts at the portal: it runs down the duct, then along the spar.
      u.uHead.value = f.pulse === i ? (f.pulseT - DUCT_SHARE) / (1 - DUCT_SHARE) : -1;
      const d = emissive.ducts[i].uniforms;
      d.uHead.value = f.pulse === i ? f.pulseT / DUCT_SHARE : -1;
      d.uLift.value = u.uLift.value;
      d.uHeld.value = u.uHeld.value;
      emissive.lamps[i].color.set(TEAMS[i].color).multiplyScalar(0.55 + Math.max(0, u.uLift.value) * 0.5 + u.uHeld.value * 0.45);
    });
    const target = f.held >= 0 ? 6 + (f.rippleT >= 0 ? (1 - f.rippleT) * 20 : 0) : 0;
    if (glow.current) {
      glow.current.intensity = THREE.MathUtils.damp(glow.current.intensity, target, 4, dt);
      if (f.held >= 0) glow.current.color.set(TEAMS[f.held].color);
    }
  });

  const events = (i: number) => ({
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHover(i);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      onHover(-1);
      document.body.style.cursor = "";
    },
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(i);
    },
  });

  return (
    <>
    {/* The hologram is a projection, so it stays still while the machine turns beneath it. */}
    <group ref={holoRef}>
      <Hologram fx={fx} shared={shared} />
    </group>
    <group ref={spinRef}>
    {PORTALS_ON && TEAMS.map((t, i) => (
      <Portal key={t.id} index={i} fx={fx} shared={shared} labelRef={labelRefs[i]} screw={screw} screwMaterial={mats.screw} onHover={onHover} onSelect={onSelect} />
    ))}
    <group ref={leanRef}>
      {/* fixed structure */}
      <mesh geometry={geo.plinth} material={mats.plinth} castShadow receiveShadow />
      <Instanced geometry={geo.deck_plate} material={mats.deck_plate} matrices={place.deck} />
      <Instanced geometry={screw} material={mats.screw} matrices={place.deckScrews} receive={false} />
      {shapes.grooves.map((g, i) => (
        <mesh key={i} geometry={g} material={emissive.grooves[i]} position={[0, 0.318, 0]} />
      ))}

      {/* outer bearing ring */}
      <group ref={outerRef}>
        <Instanced geometry={geo.bearing_panel} material={mats.bearing_panel} matrices={place.panels} />
        <Instanced geometry={screw} material={mats.screw} matrices={place.panelScrews} receive={false} />
      </group>

      {/* internal ring gear */}
      <group ref={gearRef}>
        <mesh geometry={geo.ring_gear} material={mats.ring_gear} position={[0, 0.36, 0]} castShadow receiveShadow />
        <Instanced geometry={screw} material={mats.screw} matrices={place.gearScrews} receive={false} />
      </group>

      {/* drive pinions on fixed shafts, meshed with the ring gear */}
      {PINION_ANGLES.map((theta, i) => (
        <group key={theta} position={[Math.cos(theta) * PINION_CENTRE, 0, -Math.sin(theta) * PINION_CENTRE]}>
          <group ref={(el) => void (pinionRefs.current[i] = el)} position={[0, 0.36, 0]}>
            <mesh geometry={geo.pinion} material={mats.pinion} castShadow receiveShadow />
          </group>
          <mesh geometry={geo.shaft} material={mats.shaft} position={[0, 0.34, 0]} />
        </group>
      ))}

      {/* finned inner ring */}
      <group ref={finRef}>
        <mesh geometry={geo.fin_ring} material={mats.fin_ring} castShadow receiveShadow />
      </group>

      {/* projection well */}
      <mesh geometry={geo.collar} material={mats.collar} castShadow receiveShadow />
      <Instanced geometry={screw} material={mats.screw} matrices={place.collarScrews} receive={false} />
      <mesh geometry={shapes.surface} material={emissive.surface} position={[0, 0.502, 0]} />
      <pointLight ref={glow} position={[0, 1.6, 0]} intensity={0} distance={11} decay={1.6} />

      {/* fixed spars and team couplers */}
      <Instanced geometry={screw} material={mats.screw} matrices={place.couplerScrews} receive={false} />
      {TEAMS.map((t, i) => (
        <group key={t.id} rotation={[0, t.angle, 0]}>
          <mesh geometry={geo.spar} material={mats.spar} position={[0, 0.695, 0]} castShadow receiveShadow />
          <mesh geometry={shapes.sparLine} material={emissive.lines[i]} position={[0, 0.849, 0]} />
          <mesh geometry={geo.post} material={mats.post} position={[3.4, 0.34, 0]} castShadow />
          <group position={[8.6, 0.47, 0]} {...events(i)}>
            <mesh geometry={geo.coupler} material={mats.coupler} castShadow receiveShadow />
            <mesh geometry={shapes.lamp} material={emissive.lamps[i]} position={[0.56, 0.53, 0]} />
            {/* a forgiving target, since the camera drifts a little under the pointer */}
            <mesh position={[0.08, 0.3, 0]} visible={false}>
              <boxGeometry args={[1.6, 0.9, 1.6]} />
            </mesh>
          </group>
        </group>
      ))}
      {PORTALS_ON && DUCTS.map((d, i) => (
        <group key={i} position={d.mid} quaternion={d.turn}>
          <mesh geometry={shapes.ducts[i]} material={mats.spar} castShadow receiveShadow />
          <mesh geometry={shapes.ductLines[i]} material={emissive.ducts[i]} position={[0, 0.052, 0]} />
        </group>
      ))}
    </group>
    </group>
    </>
  );
}

function CameraRig({ closeup }: { closeup: number[] | null }) {
  const home = useMemo(() => new THREE.Vector3(...FILM.position), []);
  const look = useMemo(() => new THREE.Vector3(...FILM.look), []);
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const fit = filmFit(size.width, size.height);
    camera.fov = FILM.fov;
    camera.aspect = FILM.w / FILM.h;
    camera.setViewOffset(fit.fullW, fit.fullH, fit.offsetX, fit.offsetY, size.width, size.height);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const cam = state.camera;
    if (closeup) {
      cam.position.set(closeup[0], closeup[1], closeup[2]);
      cam.lookAt(closeup[3], closeup[4], closeup[5]);
      return;
    }
    // The valley behind is a flat image, so the camera may only drift a little before the two visibly slip.
    cam.position.x = THREE.MathUtils.damp(cam.position.x, home.x + state.pointer.x * 0.22, 2.4, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, home.y - state.pointer.y * 0.1, 2.4, dt);
    cam.lookAt(look);
  });
  return null;
}

// Full paths: drei caches a map by its file names alone, so two folders of same-named files would come back as one map.
const envFaces = (dir: string) => ["px", "nx", "py", "ny", "pz", "nz"].map((f) => `${dir}${f}.webp`);

function Studio({ world }: { world: World }) {
  // Only this world's light is prepared up front. The other one downloads quietly afterwards, so a change of world still never leaves the metal unlit.
  const inSpace = world === "space";
  const map = useEnvironment({ files: envFaces(inSpace ? "/env/space/" : "/env/") });
  useEffect(() => useEnvironment.preload({ files: envFaces(inSpace ? "/env/" : "/env/space/") }), [inSpace]);
  return (
    <>
      {/* Matches the sun in unreal/land_build.py and space_build.py, so shadows on the live parts fall the same way as in the picture. */}
      <directionalLight position={[-9.6, 23, 16.7]} intensity={inSpace ? 3.2 : 2.6} color={inSpace ? "#eef6ff" : "#fff4e6"} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-camera-far={70} />
      {inSpace && <directionalLight position={[10, 5, -22]} intensity={0.7} color="#dfe4ea" />}
      <Environment map={map} environmentIntensity={inSpace ? 1.7 : 1.5} />
    </>
  );
}

function FrameWatch({ onGiveUp }: { onGiveUp: () => void }) {
  const window = useRef({ time: 0, frames: 0, bad: 0 });
  useFrame((_, dt) => {
    if (dt > 1) return; // a hidden tab or a stall, not a slow GPU
    const w = window.current;
    w.time += dt;
    w.frames += 1;
    if (w.time < 8) return;
    // Only a machine that truly can't manage loses the live world. A busy moment on a good one doesn't.
    w.bad = w.frames / w.time < 9 ? w.bad + 1 : 0;
    if (w.bad >= 2) onGiveUp();
    w.time = w.frames = 0;
  });
  return null;
}

function Inspect() {
  const { gl } = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __foundation: unknown }).__foundation = {
      renderer: () => ({ ...gl.info.render, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio() }),
    };
  }, [gl]);
  return null;
}

function Scene({ world, fx, labelRefs, signRefs, signHover, signPress, active, onHover, onSelect, onReady, onGiveUp }: { world: World; signRefs: RefObject<HTMLAnchorElement | null>[]; signHover: RefObject<number>; signPress: RefObject<number>; fx: RefObject<Fx>; labelRefs: RefObject<HTMLAnchorElement | null>[]; active: boolean; onHover: (i: number) => void; onSelect: (i: number) => void; onReady: () => void; onGiveUp: () => void }) {
  const closeup = useMemo(() => (import.meta.env.DEV ? new URLSearchParams(location.search).get("closeup")?.split(",").map(Number) ?? null : null), []);
  const capture = useMemo(() => import.meta.env.DEV && new URLSearchParams(location.search).has("capture"), []);
  // Cap the buffer near 4 MP: past that, extra pixels cost far more than they show.
  const [dpr, setDpr] = useState(() => Math.max(1, Math.min(1.75, Math.sqrt(4e6 / (innerWidth * innerHeight)))));
  return (
    <Canvas
      flat
      shadows
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [...FILM.position], fov: FILM.fov, near: 0.1, far: 320, manual: true }}
      gl={{ antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", onGiveUp);
      }}
    >
      {/* Sharpness drops first, under 30 fps. 3D is only given up after sustained failure at low sharpness. */}
      {!capture && <PerformanceMonitor bounds={() => [30, 55]} iterations={8} onDecline={() => setDpr(1)} />}
      {!capture && dpr === 1 && <FrameWatch onGiveUp={onGiveUp} />}
      <Suspense fallback={null}>
        <Studio world={world} />
        <Platform fx={fx} labelRefs={labelRefs} onHover={onHover} onSelect={onSelect} onReady={onReady} />
      </Suspense>
      {world === "valley" && <Grass />}
      {world === "valley" && (
        <Suspense fallback={null}>
          <Trees />
          {!capture && (
            <>
              <Birds />
              <FallingLeaves />
              {innerWidth / innerHeight > 0.9 && <Signpost linkRefs={signRefs} hovered={signHover} pressed={signPress} />}
            </>
          )}
        </Suspense>
      )}
      {world === "space" && (
        <Suspense fallback={null}>
          <Regolith />
          <Fleet />
        </Suspense>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[24, 64]} />
        <shadowMaterial transparent opacity={world === "space" ? 0.72 : 0.34} color={world === "space" ? "#04060a" : "#14200c"} />
      </mesh>
      <CameraRig closeup={closeup} />
      <Inspect />
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.32} radius={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}

export default memo(Scene);
