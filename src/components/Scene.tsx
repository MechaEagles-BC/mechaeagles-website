/**
 * The live foundation. Parts are parametric CAD from cad/foundation.py, with shadowing baked in cad/prep.py.
 * Illustrative machinery, not team hardware. Gear speeds and phase follow the tooth counts; see cad/check_mesh.py.
 */
import { memo, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor, useGLTF, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { TEAMS, type Fx } from "./teams";

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
const Y = new THREE.Vector3(0, 1, 0);

// ---------- shared light state ----------
const shared = {
  uTime: { value: 0 },
  uWave: { value: -1 },
  uWaveAmp: { value: 0 },
  uAccent: { value: new THREE.Color("#ffffff") },
};

// ---------- machined metal ----------
type Finish = { color: string; roughness: number; metalness?: number; turned?: number; blast?: number; scale?: boolean };

const NOISE = /* glsl */ `
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

/** Standard PBR plus finish detail computed in part space, so it needs no UVs, never tiles and fades out before it can shimmer. */
function machined({ color, roughness, metalness = 1, turned = 0, blast = 0, scale = false }: Finish, ao?: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, aoMap: ao ?? null, aoMapIntensity: 0.9 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    s.uniforms.uTurned = { value: turned };
    s.uniforms.uBlast = { value: blast };
    s.uniforms.uScale = { value: scale ? 1 : 0 };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPart; varying vec3 vWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vPart = position;
         #ifdef USE_INSTANCING
           vWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
         #else
           vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
         #endif`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vPart; varying vec3 vWorld;
         uniform float uTurned, uBlast, uScale, uTime, uWave, uWaveAmp; uniform vec3 uAccent;
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
           etch = max(fine * band, major * longBand) * step(0.28, vPart.y);
           roughnessFactor = mix(roughnessFactor, 0.9, etch);
         }`,
      )
      .replace("#include <color_fragment>", "#include <color_fragment>\n")
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
         metalnessFactor = mix(metalnessFactor, 0.2, etch);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), etch);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float worldR = length(vWorld.xz);
         float rip = exp(-pow((worldR - uWave) / 0.7, 2.0)) * uWaveAmp;
         totalEmissiveRadiance += uAccent * rip * 0.16;`,
      );
  };
  m.customProgramCacheKey = () => `machined-${turned > 0}-${blast > 0}-${scale}`;
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
function usePartGeometry(name: string) {
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
      deck_plate: machined({ color: "#5c6168", roughness: 0.62, metalness: 0.98, blast: 1 }, ao.deck_plate),
      bearing_panel: machined({ color: "#858a92", roughness: 0.5, blast: 0.8 }, ao.bearing_panel),
      ring_gear: machined({ color: "#858a92", roughness: 0.5, turned: 1, scale: true }, ao.ring_gear),
      pinion: machined({ color: "#b3b7bd", roughness: 0.42, turned: 1 }, ao.pinion),
      shaft: machined({ color: "#2b2d31", roughness: 0.4 }, ao.shaft),
      fin_ring: machined({ color: "#8a8e95", roughness: 0.44, turned: 0.8 }, ao.fin_ring),
      collar: machined({ color: "#8e9299", roughness: 0.42, turned: 1 }, ao.collar),
      spar: machined({ color: "#6a6f77", roughness: 0.56, blast: 1 }, ao.spar),
      post: machined({ color: "#b1b5bb", roughness: 0.36, turned: 0.6 }, ao.post),
      coupler: machined({ color: "#585c64", roughness: 0.58, metalness: 0.98, blast: 1 }, ao.coupler),
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

function Instanced({ geometry, material, matrices, receive = true }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; receive?: boolean }) {
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
function Platform({ fx, onHover, onSelect, onReady }: { fx: RefObject<Fx>; onHover: (i: number) => void; onSelect: (i: number) => void; onReady: () => void }) {
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
    }),
    [],
  );

  const outerRef = useRef<THREE.Group>(null);
  const gearRef = useRef<THREE.Group>(null);
  const finRef = useRef<THREE.Group>(null);
  const leanRef = useRef<THREE.Group>(null);
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

    leanRef.current!.rotation.x = THREE.MathUtils.damp(leanRef.current!.rotation.x, state.pointer.y * -0.018, 2.2, dt);
    leanRef.current!.rotation.z = THREE.MathUtils.damp(leanRef.current!.rotation.z, state.pointer.x * -0.018, 2.2, dt);

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
    emissive.lines.forEach((mat, i) => {
      const u = mat.uniforms;
      const heldNow = f.held === i && f.pulse !== i ? 1 : 0;
      const lift = f.hover === i ? 1 : f.hover >= 0 || f.held >= 0 ? -0.09 : 0;
      u.uLift.value = THREE.MathUtils.damp(u.uLift.value, lift, 9, dt);
      u.uHeld.value = THREE.MathUtils.damp(u.uHeld.value, heldNow, 6, dt);
      u.uHead.value = f.pulse === i ? f.pulseT : -1;
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
    </group>
  );
}

function CameraRig({ closeup }: { closeup: number[] | null }) {
  const home = useMemo(() => new THREE.Vector3(0, 14.2, 25), []);
  const look = useMemo(() => new THREE.Vector3(0, -1.5, 0.6), []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const cam = state.camera;
    if (closeup) {
      cam.position.set(closeup[0], closeup[1], closeup[2]);
      cam.lookAt(closeup[3], closeup[4], closeup[5]);
      return;
    }
    cam.position.x = THREE.MathUtils.damp(cam.position.x, home.x + state.pointer.x * 1.5, 2.4, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, home.y - state.pointer.y * 0.7, 2.4, dt);
    cam.lookAt(look);
  });
  return null;
}

function Studio() {
  return (
    <>
      <ambientLight intensity={0.02} />
      <spotLight position={[6, 17, 8]} angle={0.68} penumbra={0.85} intensity={460} decay={2} color="#e4ebf6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} />
      <spotLight position={[-10, 8, -10]} angle={0.8} penumbra={1} intensity={80} decay={2} color="#ffd6a8" />
      <Environment resolution={512} frames={1} environmentIntensity={1.12}>
        <color attach="background" args={["#05070a"]} />
        {/* a large soft ceiling panel is what top-facing metal actually reflects from this camera */}
        <Lightformer form="rect" intensity={1.5} color="#c9d6e8" position={[0, 16, -10]} rotation-x={Math.PI / 2.4} scale={[34, 16, 1]} />
        <Lightformer form="rect" intensity={7} color="#f1f5fb" position={[0, 15, -18]} rotation-x={Math.PI / 2.6} scale={[26, 1.1, 1]} />
        <Lightformer form="rect" intensity={5} color="#e6eefb" position={[-9, 14, -6]} rotation-x={Math.PI / 2} scale={[1, 22, 1]} />
        <Lightformer form="rect" intensity={5} color="#e6eefb" position={[9, 14, -6]} rotation-x={Math.PI / 2} scale={[1, 22, 1]} />
        <Lightformer form="rect" intensity={3} color="#ffd2a0" position={[16, 3, -6]} rotation-y={-Math.PI / 2} scale={[14, 2.2, 1]} />
        <Lightformer form="rect" intensity={3} color="#a9c6f0" position={[-16, 3, 4]} rotation-y={Math.PI / 2} scale={[14, 2.2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 2, 18]} rotation-y={Math.PI} scale={[26, 1, 1]} />
        {/* a low horizon band, so vertical walls have something to reflect */}
        <Lightformer form="rect" intensity={0.55} color="#a9b6c8" position={[0, 1, 20]} rotation-y={Math.PI} scale={[44, 7, 1]} />
        <Lightformer form="rect" intensity={0.55} color="#a9b6c8" position={[0, 1, -20]} scale={[44, 7, 1]} />
        <Lightformer form="rect" intensity={0.55} color="#a9b6c8" position={[20, 1, 0]} rotation-y={-Math.PI / 2} scale={[44, 7, 1]} />
        <Lightformer form="rect" intensity={0.55} color="#a9b6c8" position={[-20, 1, 0]} rotation-y={Math.PI / 2} scale={[44, 7, 1]} />
      </Environment>
    </>
  );
}

function FrameWatch({ onGiveUp }: { onGiveUp: () => void }) {
  const window = useRef({ time: 0, frames: 0 });
  useFrame((_, dt) => {
    if (dt > 1) return; // a hidden tab or a stall, not a slow GPU
    const w = window.current;
    w.time += dt;
    w.frames += 1;
    if (w.time < 8) return;
    if (w.frames / w.time < 18) onGiveUp();
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

function Scene({ fx, onHover, onSelect, onReady, onGiveUp, onMiss }: { fx: RefObject<Fx>; onHover: (i: number) => void; onSelect: (i: number) => void; onReady: () => void; onGiveUp: () => void; onMiss: () => void }) {
  const closeup = useMemo(() => (import.meta.env.DEV ? new URLSearchParams(location.search).get("closeup")?.split(",").map(Number) ?? null : null), []);
  // Portrait screens widen the lens until the full 20.8 m platform fits at the rig's 29 m distance.
  const aspect = innerWidth / innerHeight;
  const fov = aspect < 1.2 ? THREE.MathUtils.radToDeg(2 * Math.atan(10.4 / (29 * aspect))) : 30;
  const capture = useMemo(() => import.meta.env.DEV && new URLSearchParams(location.search).has("capture"), []);
  // Cap the buffer near 4 MP: past that, extra pixels cost far more than they show.
  const [dpr, setDpr] = useState(() => Math.max(1, Math.min(1.75, Math.sqrt(4e6 / (innerWidth * innerHeight)))));
  return (
    <Canvas
      flat
      shadows
      dpr={dpr}
      camera={{ position: [0, 14.2, 25], fov, near: 0.1, far: 160 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onPointerMissed={onMiss}
      onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", onGiveUp)}
    >
      <color attach="background" args={["#030406"]} />
      <fog attach="fog" args={["#030406", 26, 56]} />
      {/* Sharpness drops first, under 30 fps. 3D is only given up after sustained failure at low sharpness. */}
      {!capture && <PerformanceMonitor bounds={() => [30, 55]} iterations={8} onDecline={() => setDpr(1)} />}
      {!capture && dpr === 1 && <FrameWatch onGiveUp={onGiveUp} />}
      <Studio />
      <Suspense fallback={null}>
        <Platform fx={fx} onHover={onHover} onSelect={onSelect} onReady={onReady} />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#0a0b0e" metalness={0.6} roughness={0.62} />
      </mesh>
      <CameraRig closeup={closeup} />
      <Inspect />
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.32} radius={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.34} darkness={0.5} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.12} />
      </EffectComposer>
    </Canvas>
  );
}

export default memo(Scene);
