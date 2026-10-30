/**
 * Foundation prototype: a real-time test of the Mission Control platform in React Three Fiber.
 * All geometry is generated here and is illustrative, not team hardware.
 * Units are metres. Gear speeds follow their tooth ratio and the teeth mesh.
 */
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshReflectorMaterial, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const TEAMS = [
  { id: "baja", name: "Baja SAE", color: "#f2a33a", angle: -Math.PI * 0.75 },
  { id: "aero", name: "AeroEagles", color: "#6fb7ff", angle: Math.PI * 0.75 },
  { id: "combat", name: "Combat Robotics", color: "#ff3d1f", angle: Math.PI * 0.25 },
  { id: "ai", name: "AI Safety", color: "#9b8cff", angle: -Math.PI * 0.25 },
];
const SPAR_OUT = 8.1;
const SPAR_IN = 2.7;
const RING_PITCH_R = 4.3;
const RING_TEETH = 96;
const PINION_TEETH = 12;
const PINION_PITCH_R = (RING_PITCH_R * PINION_TEETH) / RING_TEETH;
const PINION_ANGLES = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const PULSE_SECONDS = 0.85;
const RIPPLE_SECONDS = 1.5;
const TAU = Math.PI * 2;

// ---------- geometry ----------
type P = [number, number];

/** Lathe a cross-section as separate faces so chamfers stay crisp. Points run up the outside, inward, then down. */
function lathe(profile: P[], segments = 256) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const g = new THREE.LatheGeometry(
      [new THREE.Vector2(profile[i][0], profile[i][1]), new THREE.Vector2(profile[i + 1][0], profile[i + 1][1])],
      segments,
    );
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let k = 0; k < pos.count; k++) {
      uv.setY(k, (Math.hypot(pos.getX(k), pos.getZ(k)) + pos.getY(k)) * 0.35);
    }
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

function ringProfile(rOut: number, rIn: number, yBot: number, yTop: number, ch = 0.02): P[] {
  return [[rOut, yBot], [rOut, yTop - ch], [rOut - ch, yTop], [rIn + ch, yTop], [rIn, yTop - ch], [rIn, yBot]];
}

function flatAnnulus(rOut: number, rIn: number, y: number, segments = 256) {
  return lathe([[rOut, y], [rIn, y]], segments);
}

function extrude(shape: THREE.Shape, depth: number, bevel: number, curve = 24) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: curve,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

function arcPanel(rOut: number, rIn: number, sweep: number, depth: number, bevel = 0.012) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut - bevel, -sweep / 2, sweep / 2, false);
  s.absarc(0, 0, rIn + bevel, sweep / 2, -sweep / 2, true);
  s.closePath();
  return extrude(s, depth, bevel, 16);
}

/** Closed outline of simple trapezoid teeth (not a true involute profile). Tooth centres sit at k * pitch. */
function toothOutline(teeth: number, rTip: number, rRoot: number) {
  const pts: THREE.Vector2[] = [];
  const pitch = TAU / teeth;
  const at = (r: number, a: number) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  for (let k = 0; k < teeth; k++) {
    const c = k * pitch;
    pts.push(at(rRoot, c - pitch * 0.32), at(rTip, c - pitch * 0.16), at(rTip, c + pitch * 0.16), at(rRoot, c + pitch * 0.32));
  }
  return pts;
}

function ringGear(rOut: number, depth: number) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, TAU, false);
  const hole = new THREE.Path(toothOutline(RING_TEETH, RING_PITCH_R - 0.075, RING_PITCH_R + 0.095).reverse());
  s.holes.push(hole);
  return extrude(s, depth, 0.008, 96);
}

function pinionGear(depth: number) {
  const s = new THREE.Shape(toothOutline(PINION_TEETH, PINION_PITCH_R + 0.075, PINION_PITCH_R - 0.095));
  s.holes.push(new THREE.Path().absarc(0, 0, 0.11, 0, TAU, true) as THREE.Path);
  return extrude(s, depth, 0.006, 16);
}

function sparGeometry(length: number, width: number, height: number) {
  const c = 0.035;
  const s = new THREE.Shape();
  s.moveTo(0, -width / 2 + c);
  s.lineTo(c, -width / 2);
  s.lineTo(length - c, -width / 2);
  s.lineTo(length, -width / 2 + c);
  s.lineTo(length, width / 2 - c);
  s.lineTo(length - c, width / 2);
  s.lineTo(c, width / 2);
  s.lineTo(0, width / 2 - c);
  s.closePath();
  return extrude(s, height, 0.012, 1);
}

// ---------- surface textures ----------
/** Machined metal: fine streaks running along u, with slow wear across the part. */
function machinedTexture(repeatU: number, repeatV: number) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const rows = new Float32Array(size).map(() => rnd());
  for (let y = 0; y < size; y++) {
    const coarse = Math.sin((y / size) * TAU * 3) * 0.05;
    for (let x = 0; x < size; x++) {
      const wear = Math.sin((x / size) * TAU * 2 + y * 0.01) * 0.04;
      const v = THREE.MathUtils.clamp(0.8 + (rows[y] - 0.5) * 0.2 + coarse + wear + (rnd() - 0.5) * 0.03, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatU, repeatV);
  t.anisotropy = 8;
  return t;
}

function useMaterials() {
  return useMemo(() => {
    const turned = machinedTexture(6, 1);
    const flat = machinedTexture(0.18, 0.18);
    const metal = (color: string, roughness: number, tex: THREE.Texture, bump = 0.0012, metalness = 1) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, roughnessMap: tex, bumpMap: tex, bumpScale: bump });
    return {
      base: metal("#3c4047", 0.8, turned, 0.0008, 0.92),
      deck: metal("#4a4e55", 0.82, flat, 0, 0.95),
      panel: metal("#8a8f97", 0.66, flat, 0),
      gear: metal("#656a72", 0.6, turned),
      steel: metal("#b4b8bf", 0.54, turned),
      spar: metal("#555a62", 0.68, flat, 0),
      bolt: new THREE.MeshStandardMaterial({ color: "#c2c5ca", metalness: 1, roughness: 0.3 }),
      black: new THREE.MeshStandardMaterial({ color: "#07080a", metalness: 0.6, roughness: 0.7 }),
    };
  }, []);
}

// ---------- emissive shaders ----------
const shared = {
  uTime: { value: 0 },
  uWave: { value: -1 },
  uWaveAmp: { value: 0 },
  uAccent: { value: new THREE.Color("#ffffff") },
};

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
        float lines = smoothstep(0.42, 0.5, abs(fract(r * 7.0) - 0.5)) * 0.14;
        float spokes = smoothstep(0.48, 0.5, abs(fract(a * 18.0 / 6.2831853) - 0.5)) * smoothstep(0.7, 1.0, r) * 0.08;
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
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHead: { value: -1 },
      uLift: { value: 0 },
      uHeld: { value: 0 },
    },
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

// ---------- instanced parts ----------
function Instanced({ geometry, material, matrices, cast = true }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current!;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow={cast} receiveShadow />;
}

function polar(count: number, radius: number, y: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = offset + (i / count) * TAU;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
      new THREE.Vector3(1, 1, 1),
    );
  });
}

// ---------- selection state, kept outside React so the frame loop stays allocation free ----------
type Fx = { hover: number; held: number; pulse: number; pulseT: number; rippleT: number; boost: number; settle: number; kick: () => void };

function Platform({ fx, onHover, onSelect, calm }: { fx: React.RefObject<Fx>; onHover: (i: number) => void; onSelect: (i: number) => void; calm: boolean }) {
  const m = useMaterials();
  const { invalidate } = useThree();
  useEffect(() => {
    fx.current!.kick = () => {
      fx.current!.settle = 45;
      invalidate();
    };
    fx.current!.kick();
  }, [fx, invalidate]);

  const geo = useMemo(() => {
    const boltHead = new THREE.CylinderGeometry(0.035, 0.038, 0.028, 6);
    return {
      plinth: lathe([[9.75, 0], [9.75, 0.13], [9.68, 0.18], [9.45, 0.18], [9.45, 0.3], [9.4, 0.34], [0.01, 0.34]]),
      deckPlate: arcPanel(9.2, 7.18, TAU / 32 - 0.005, 0.13),
      groove1: flatAnnulus(7.07, 7.02, 0.352),
      outerPanel: arcPanel(6.94, 5.78, TAU / 24 - 0.006, 0.27),
      outerInset: arcPanel(6.72, 6.0, TAU / 24 - 0.05, 0.3),
      groove2: flatAnnulus(5.68, 5.63, 0.352),
      ringGear: ringGear(5.54, 0.25),
      ringGearLip: lathe(ringProfile(5.54, 4.62, 0.61, 0.645, 0.012)),
      pinion: pinionGear(0.25),
      pinionCap: lathe(ringProfile(0.3, 0.11, 0.25, 0.3, 0.012), 48),
      groove3: flatAnnulus(3.27, 3.22, 0.352),
      finInner: lathe(ringProfile(2.66, 2.5, 0.36, 0.58)),
      finOuter: lathe(ringProfile(3.12, 2.98, 0.36, 0.58)),
      fin: new THREE.BoxGeometry(0.34, 0.16, 0.022),
      collar: lathe([[2.47, 0.34], [2.47, 0.64], [2.43, 0.68], [2.28, 0.68], [2.25, 0.65], [2.25, 0.5]]),
      surface: flatAnnulus(2.25, 0.001, 0.5, 128),
      spar: sparGeometry(SPAR_OUT - SPAR_IN, 0.46, 0.15),
      sparLine: new THREE.BoxGeometry(SPAR_OUT - SPAR_IN - 0.2, 0.004, 0.035).translate((SPAR_OUT + SPAR_IN) / 2, 0, 0),
      post: new THREE.CylinderGeometry(0.075, 0.095, 0.34, 16),
      housing: extrude(
        (() => {
          const s = new THREE.Shape();
          s.moveTo(-0.5, -0.55);
          s.lineTo(0.35, -0.55);
          s.lineTo(0.62, -0.28);
          s.lineTo(0.62, 0.28);
          s.lineTo(0.35, 0.55);
          s.lineTo(-0.5, 0.55);
          s.closePath();
          return s;
        })(),
        0.62,
        0.02,
        1,
      ),
      indicator: new THREE.BoxGeometry(0.1, 0.012, 0.74),
      boltHead,
    };
  }, []);

  const placements = useMemo(() => {
    const deck = polar(32, 0, 0.34);
    const outer = polar(24, 0, 0.36);
    const deckBolts = [...polar(64, 9.02, 0.48, 0.05), ...polar(64, 7.36, 0.48, 0.05)];
    const outerBolts = [...polar(48, 6.84, 0.645, 0.1), ...polar(48, 5.88, 0.645, 0.1)];
    const gearBolts = polar(36, 5.2, 0.655);
    const fins = polar(48, 2.82, 0.46);
    return { deck, outer, deckBolts, outerBolts, gearBolts, fins };
  }, []);

  const emissive = useMemo(
    () => ({
      g1: grooveMaterial(0.8, 0.7),
      g2: grooveMaterial(0.6, -0.5),
      g3: grooveMaterial(0.8, 1.0),
      surface: projectionMaterial(),
      lines: TEAMS.map((t) => sparLineMaterial(t.color)),
      lamps: TEAMS.map((t) => new THREE.MeshBasicMaterial({ color: new THREE.Color(t.color).multiplyScalar(0.6), toneMapped: false })),
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

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const f = fx.current!;
    shared.uTime.value = calm ? 0 : state.clock.elapsedTime;

    f.boost = THREE.MathUtils.damp(f.boost, 0, 1.4, dt);
    const speed = calm ? 0 : 1 + f.boost * 7;
    rot.current.outer += 0.018 * speed * dt;
    rot.current.gear -= 0.03 * speed * dt;
    rot.current.fin += 0.055 * speed * dt;
    outerRef.current!.rotation.y = rot.current.outer;
    gearRef.current!.rotation.y = rot.current.gear;
    finRef.current!.rotation.y = rot.current.fin;

    // A three.js rotation about +y turns +x toward -z, so measure ring angle in the shape's own direction.
    const ratio = RING_TEETH / PINION_TEETH;
    PINION_ANGLES.forEach((theta, i) => {
      const pin = pinionRefs.current[i];
      if (!pin) return;
      const delta = rot.current.gear + theta;
      pin.rotation.y = -(Math.PI / PINION_TEETH + delta * ratio) + theta;
    });

    if (!calm && leanRef.current) {
      leanRef.current.rotation.x = THREE.MathUtils.damp(leanRef.current.rotation.x, state.pointer.y * -0.018, 2.2, dt);
      leanRef.current.rotation.z = THREE.MathUtils.damp(leanRef.current.rotation.z, state.pointer.x * -0.018, 2.2, dt);
    }

    // pulse from the coupler to the centre, then a ripple outward across the platform
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
      shared.uWave.value = k * 8;
      shared.uWaveAmp.value = Math.max(0, 1 - k) * 0.9;
      if (k >= 1) {
        f.rippleT = -1;
        shared.uWave.value = -1;
        shared.uWaveAmp.value = 0;
      }
    }
    emissive.lines.forEach((mat, i) => {
      const u = mat.uniforms;
      const heldNow = f.held === i && f.pulse !== i ? 1 : 0;
      const lift = f.hover === i ? 1 : f.hover >= 0 || f.held >= 0 ? -0.09 : 0;
      u.uLift.value = THREE.MathUtils.damp(u.uLift.value, lift, 9, dt);
      u.uHeld.value = THREE.MathUtils.damp(u.uHeld.value, heldNow, 6, dt);
      u.uHead.value = f.pulse === i ? f.pulseT : -1;
      emissive.lamps[i].color.set(TEAMS[i].color).multiplyScalar(0.55 + Math.max(0, u.uLift.value) * 0.5 + u.uHeld.value * 0.45);
    });

    const target = f.held >= 0 ? 7 + (f.rippleT >= 0 ? (1 - f.rippleT) * 26 : 0) : 0;
    if (glow.current) {
      glow.current.intensity = THREE.MathUtils.damp(glow.current.intensity, target, 4, dt);
      if (f.held >= 0) glow.current.color.set(TEAMS[f.held].color);
    }
    if (calm && f.settle-- > 0) invalidate();
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
      <mesh geometry={geo.plinth} material={m.base} receiveShadow castShadow />
      <Instanced geometry={geo.deckPlate} material={m.deck} matrices={placements.deck} />
      <Instanced geometry={geo.boltHead} material={m.bolt} matrices={placements.deckBolts} />
      <mesh geometry={geo.groove1} material={emissive.g1} />
      <mesh geometry={geo.groove2} material={emissive.g2} />
      <mesh geometry={geo.groove3} material={emissive.g3} />

      {/* outer bearing ring */}
      <group ref={outerRef}>
        <Instanced geometry={geo.outerPanel} material={m.panel} matrices={placements.outer} />
        <Instanced geometry={geo.outerInset} material={m.gear} matrices={placements.outer} />
        <Instanced geometry={geo.boltHead} material={m.bolt} matrices={placements.outerBolts} />
      </group>

      {/* internal ring gear */}
      <group ref={gearRef}>
        <mesh geometry={geo.ringGear} material={m.gear} position={[0, 0.36, 0]} castShadow receiveShadow />
        <mesh geometry={geo.ringGearLip} material={m.steel} castShadow receiveShadow />
        <Instanced geometry={geo.boltHead} material={m.bolt} matrices={placements.gearBolts} />
      </group>

      {/* drive pinions, meshed with the ring gear */}
      {PINION_ANGLES.map((theta, i) => (
        <group key={theta} position={[Math.cos(theta) * (RING_PITCH_R - PINION_PITCH_R), 0.36, -Math.sin(theta) * (RING_PITCH_R - PINION_PITCH_R)]}>
          <group ref={(el) => void (pinionRefs.current[i] = el)}>
            <mesh geometry={geo.pinion} material={m.steel} castShadow receiveShadow />
            <mesh geometry={geo.pinionCap} material={m.gear} />
          </group>
        </group>
      ))}

      {/* finned inner ring */}
      <group ref={finRef}>
        <mesh geometry={geo.finInner} material={m.steel} castShadow receiveShadow />
        <mesh geometry={geo.finOuter} material={m.steel} castShadow receiveShadow />
        <Instanced geometry={geo.fin} material={m.gear} matrices={placements.fins} />
      </group>

      {/* projection well */}
      <mesh geometry={geo.collar} material={m.spar} castShadow receiveShadow />
      <mesh geometry={geo.surface} material={emissive.surface} />
      <pointLight ref={glow} position={[0, 1.6, 0]} intensity={0} distance={11} decay={1.6} />

      {/* fixed spars and team couplers */}
      {TEAMS.map((t, i) => (
        <group key={t.id} rotation={[0, t.angle, 0]}>
          <mesh geometry={geo.spar} material={m.spar} position={[SPAR_IN, 0.72, 0]} castShadow receiveShadow />
          <mesh geometry={geo.sparLine} material={emissive.lines[i]} position={[0, 0.872, 0]} />
          {[3.28, 7.05].map((x) => (
            <mesh key={x} geometry={geo.post} material={m.steel} position={[x, 0.55, 0]} castShadow />
          ))}
          <group position={[8.6, 0.34, 0]} {...events(i)}>
            <mesh geometry={geo.housing} material={m.spar} castShadow receiveShadow />
            <mesh geometry={geo.indicator} material={emissive.lamps[i]} position={[0.5, 0.626, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
}

function Floor({ reflections }: { reflections: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
      <circleGeometry args={[60, 64]} />
      {reflections ? (
        <MeshReflectorMaterial resolution={512} blur={[320, 90]} mixBlur={1} mixStrength={4} roughness={0.72} metalness={0.6} color="#0a0b0e" depthScale={0.8} minDepthThreshold={0.4} maxDepthThreshold={1.2} mirror={0} />
      ) : (
        <meshStandardMaterial color="#0a0b0e" metalness={0.6} roughness={0.6} />
      )}
    </mesh>
  );
}

function CameraRig({ calm, reach }: { calm: boolean; reach: number }) {
  const closeup = useMemo(() => (import.meta.env.DEV ? new URLSearchParams(location.search).get("closeup")?.split(",").map(Number) : null), []);
  const home = useMemo(() => new THREE.Vector3(0, 14.2 * reach, 25 * reach), [reach]);
  const look = useMemo(() => new THREE.Vector3(0, -1.5, 0.6), []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const cam = state.camera;
    if (closeup) {
      cam.position.set(closeup[0], closeup[1], closeup[2]);
      cam.lookAt(closeup[3], closeup[4], closeup[5]);
      return;
    }
    const x = calm ? 0 : state.pointer.x * 1.5;
    const y = calm ? 0 : state.pointer.y * -0.7;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, home.x + x, 2.4, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, home.y + y, 2.4, dt);
    cam.lookAt(look);
  });
  return null;
}

function Studio() {
  return (
    <>
      <ambientLight intensity={0.02} />
      <spotLight position={[6, 17, 8]} angle={0.68} penumbra={0.85} intensity={520} decay={2} color="#e4ebf6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} />
      <spotLight position={[-10, 8, -10]} angle={0.8} penumbra={1} intensity={90} decay={2} color="#ffd6a8" />
      <Environment resolution={512} frames={1} environmentIntensity={1}>
        <color attach="background" args={["#05070a"]} />
        {/* a large soft ceiling panel is what top-facing metal actually reflects from this camera */}
        <Lightformer form="rect" intensity={1.5} color="#c9d6e8" position={[0, 16, -10]} rotation-x={Math.PI / 2.4} scale={[34, 16, 1]} />
        <Lightformer form="rect" intensity={7} color="#f1f5fb" position={[0, 15, -18]} rotation-x={Math.PI / 2.6} scale={[26, 1.1, 1]} />
        <Lightformer form="rect" intensity={5} color="#e6eefb" position={[-9, 14, -6]} rotation-x={Math.PI / 2} scale={[1, 22, 1]} />
        <Lightformer form="rect" intensity={5} color="#e6eefb" position={[9, 14, -6]} rotation-x={Math.PI / 2} scale={[1, 22, 1]} />
        <Lightformer form="rect" intensity={3} color="#ffd2a0" position={[16, 3, -6]} rotation-y={-Math.PI / 2} scale={[14, 2.2, 1]} />
        <Lightformer form="rect" intensity={3} color="#a9c6f0" position={[-16, 3, 4]} rotation-y={Math.PI / 2} scale={[14, 2.2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 2, 18]} rotation-y={Math.PI} scale={[26, 1, 1]} />
      </Environment>
    </>
  );
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

class GLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="lab__fallback">3D is unavailable on this device. The team controls below still work.</p> : this.props.children;
  }
}

export default function Foundation() {
  const calm = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const small = useMemo(() => matchMedia("(max-width: 700px)").matches, []);
  const fx = useRef<Fx>({ hover: -1, held: -1, pulse: -1, pulseT: 0, rippleT: -1, boost: 0, settle: 45, kick: () => {} });
  const [held, setHeld] = useState(-1);
  const [dpr, setDpr] = useState(small ? 1.25 : 1.75);
  const [rich, setRich] = useState(!small);

  const hover = (i: number) => {
    fx.current.hover = i;
    fx.current.kick();
  };
  const select = (i: number) => {
    const f = fx.current;
    setHeld(i);
    f.kick();
    if (i < 0) {
      f.held = -1;
      return;
    }
    shared.uAccent.value.set(TEAMS[i].color);
    f.held = i;
    if (calm) return;
    f.pulse = i;
    f.pulseT = 0;
    f.rippleT = -1;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lab">
      <div className="lab__canvas" aria-hidden="true">
        <GLBoundary>
          <Canvas
            flat
            shadows
            dpr={dpr}
            frameloop={calm ? "demand" : "always"}
            camera={{ position: [0, small ? 26.3 : 14.2, small ? 46.3 : 25], fov: small ? 46 : 30, near: 0.5, far: 160 }}
            gl={{ antialias: false, powerPreference: "high-performance" }}
            onPointerMissed={() => select(-1)}
          >
            <color attach="background" args={["#030406"]} />
            <fog attach="fog" args={["#030406", small ? 50 : 24, small ? 96 : 52]} />
            <PerformanceMonitor onDecline={() => { setDpr(1); setRich(false); }} />
            <Studio />
            <Platform fx={fx} onHover={hover} onSelect={select} calm={calm} />
            <Floor reflections={rich} />
            <CameraRig calm={calm} reach={small ? 1.85 : 1} />
            <Inspect />
            {!new URLSearchParams(location.search).has("nofx") && (
              <EffectComposer multisampling={rich ? 4 : 0} enableNormalPass={false}>
                <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.32} radius={0.5} />
                <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                <Vignette eskil={false} offset={0.34} darkness={0.5} />
                <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.12} />
              </EffectComposer>
            )}
          </Canvas>
        </GLBoundary>
      </div>

      <header className="lab__head">
        <p className="lab__kicker">MechaEagles · Mission Control</p>
        <h1 className="lab__title">Foundation prototype</h1>
        <p className="lab__note">Real-time React Three Fiber test. Illustrative geometry, not team hardware.</p>
      </header>

      <div className="lab__foot">
        <p className="lab__status" aria-live="polite">
          {held >= 0 ? `${TEAMS[held].name} selected. In the site this would open the team page. Esc clears.` : "Select a team to send a pulse to the centre."}
        </p>
        <div className="lab__teams" role="group" aria-label="Teams">
          {TEAMS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className="lab__team"
              style={{ "--c": t.color } as React.CSSProperties}
              aria-pressed={held === i}
              onPointerEnter={() => hover(i)}
              onPointerLeave={() => hover(-1)}
              onFocus={() => hover(i)}
              onBlur={() => hover(-1)}
              onClick={() => select(i)}
            >
              <i aria-hidden="true"></i>
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
