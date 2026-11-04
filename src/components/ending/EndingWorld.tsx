/**
 * The last shot on Home: Gasson Tower, drawn by the same contour lines as the living map spreading from its base. The map breathes on its own and answers the music when it's on:
 * bass sends ripples out through the contours, and high notes make the lines sizzle. The four crests are the four teams. It only draws while it's on screen.
 * The land is drawn from the roster by terrain.ts. The tower is the first-pass model from photographs in gasson/, not a survey.
 */
import { memo, Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { soundLevels } from "../soundtrack";
import { TEAMS, type World } from "../teams";
import { Warmup } from "../warm";
import { terrainFor, LAND_SIZE, massifAt, massifHeight, type Terrain } from "./terrain";

const PARTS = ["tower", "facade", "bay"];
const URLS = PARTS.map((p) => `/models/gasson/${p}.glb`);
const STEP = 3; // metres between contour lines up the tower
const LAND_STEP = 1.4; // and across the land, where the slopes are gentler
const RINGS = 5;
const LAND_CREST = 0.72; // how far up its own peak a massif's lines take its team's colour
const IDLE_PULSE = 5.5; // seconds between ripples when there's no music
const QUIET_PULSE = 2.8; // and at the longest while music plays, for gentle passages with no clear beat

// Lines change colour with height: the valley at dusk runs neon, cyan in the low ground to pink on the crests. Space stays cold starlight.
const LOOK: Record<World, { line: string; high: string; glow: string }> = {
  valley: { line: "#3ff2d8", high: "#ff4fa3", glow: "#fff0f8" },
  space: { line: "#7fbfe6", high: "#a9d8ff", glow: "#e8f7ff" },
};

const shared = {
  uTime: { value: 0 },
  uLow: { value: 0 },
  uHigh: { value: 0 },
  uRing: { value: new Float32Array(RINGS) },
  uRingA: { value: new Float32Array(RINGS) },
  uLine: { value: new THREE.Color(LOOK.valley.line) },
  uGlow: { value: new THREE.Color(LOOK.valley.glow) },
  uHighLine: { value: new THREE.Color(LOOK.valley.high) },
};

const LINE = /* glsl */ `
  float contour(float x, float width){ float d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-4); return 1.0 - smoothstep(0.0, width, d); }
  float sparkle(vec3 p, float t){ return fract(sin(dot(floor(p * 1.6) + floor(t * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;

const LAND_GLSL = /* glsl */ `
      uniform sampler2D uLand;
      float land(vec2 p){ return texture2D(uLand, p / ${LAND_SIZE}.0 + 0.5).r; }
`;

function landMaterial(height: THREE.Texture, terrain: Terrain) {
  const hills = TEAMS.map((t) => massifAt(t.angle));
  const tops = TEAMS.map((t) => massifHeight(terrain.teams[t.href.split("/").filter(Boolean).pop()!] ?? 0));
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uHill: { value: hills }, uHillColor: { value: TEAMS.map((t) => new THREE.Color(t.color)) }, uLand: { value: height }, uHillTop: { value: tops } },
    vertexShader: /* glsl */ `
      uniform float uTime, uLow; uniform float uRing[${RINGS}]; uniform float uRingA[${RINGS}]; uniform vec2 uHill[4];
      varying float vExtra, vDist, vPulse; varying vec2 vXZ;
      ${LAND_GLSL}
      void main(){
        vec2 p = position.xz;
        float r = length(p);
        float h = land(p);
        float base = h;
        // The ground around the tower is never quite still: rings travel out from its base.
        h += sin(r * 0.21 - uTime * 0.55) * (1.1 + uLow * 2.2) * smoothstep(8.0, 22.0, r) * (1.0 - smoothstep(90.0, 210.0, r));
        float pulse = 0.0;
        for (int i = 0; i < ${RINGS}; i++) { float k = (r - uRing[i]) / 9.0; pulse += exp(-k * k) * uRingA[i]; }
        h += pulse * 2.6;
        vExtra = h - base; vDist = r; vPulse = pulse; vXZ = p;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p.x, h, p.y, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uHigh; uniform vec3 uLine, uGlow, uHighLine; uniform vec2 uHill[4]; uniform vec3 uHillColor[4]; uniform float uHillTop[4];
      varying float vExtra, vDist, vPulse; varying vec2 vXZ;
      ${LINE}
      ${LAND_GLSL}
      void main(){
        // Read per pixel rather than per vertex, so every gully and terrace gets its own line.
        float vH = land(vXZ) + vExtra;
        float major = contour(vH / ${(LAND_STEP * 5).toFixed(1)}, 1.5);
        float minor = contour(vH / ${LAND_STEP.toFixed(1)}, 1.0);
        float fade = 1.0 - smoothstep(170.0, 310.0, vDist);
        float sizzle = step(1.0 - uHigh * 0.42, sparkle(vec3(vXZ, vH), uTime)) * minor;
        vec3 color = mix(mix(uLine, uHighLine, smoothstep(2.0, 34.0, vH)), uGlow, clamp(vPulse * 0.9 + sizzle, 0.0, 1.0));
        for (int i = 0; i < 4; i++) { vec2 d = vXZ - uHill[i]; float crest = exp(-dot(d, d) / 500.0) * smoothstep(uHillTop[i] * ${(LAND_CREST - 0.2).toFixed(2)}, uHillTop[i] * ${LAND_CREST.toFixed(2)}, vH); color = mix(color, uHillColor[i], clamp(crest * 1.4, 0.0, 0.95)); }
        float a = (minor * 0.42 + major * 0.62 + vPulse * minor * 0.8 + sizzle * 0.8) * fade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(color, min(a, 1.0));
      }`,
    transparent: true,
    depthWrite: true,
    toneMapped: false,
  });
}

const fill = new THREE.MeshBasicMaterial({ colorWrite: false });

function towerMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vP, vN, vV;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLow, uHigh; uniform vec3 uLine, uGlow, uHighLine; uniform float uRingA[${RINGS}];
      varying vec3 vP, vN, vV;
      ${LINE}
      void main(){
        float rise = uTime * 0.12;
        float band = contour(vP.y / ${STEP.toFixed(1)} - rise, 1.3);
        float len = length(vN);
        float facing = len > 1e-4 ? abs(dot(vN / len, normalize(vV))) : 1.0;
        float rim = pow(1.0 - facing, 2.4);
        float beat = 0.0;
        for (int i = 0; i < ${RINGS}; i++) beat = max(beat, uRingA[i]);
        float sizzle = step(1.0 - uHigh * 0.5, sparkle(vP, uTime)) * band;
        float a = band * (0.85 + uLow * 0.4) + rim * 0.55 + sizzle + beat * band * 0.35;
        gl_FragColor = vec4(mix(mix(uLine, uHighLine, smoothstep(0.0, 61.0, vP.y)), uGlow, clamp(0.12 + beat * 0.5 + sizzle + uLow * 0.3, 0.0, 1.0)), clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    toneMapped: false,
  });
}

function Tower() {
  const loaded = useGLTF(URLS, false, true) as unknown as { scene: THREE.Group }[];
  const geometries = useMemo(() => {
    const out: THREE.BufferGeometry[] = [];
    loaded.forEach(({ scene }) => {
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Compressed parts store quantized attributes scaled by their node, so expand to floats before applying it.
        const g = new THREE.BufferGeometry();
        for (const name of ["position", "normal"]) {
          const a = mesh.geometry.getAttribute(name);
          if (!a) continue;
          const floats = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) floats[i * a.itemSize + c] = a.getComponent(i, c);
          g.setAttribute(name, new THREE.BufferAttribute(floats, a.itemSize));
        }
        g.setIndex(mesh.geometry.getIndex());
        out.push(g.applyMatrix4(mesh.matrixWorld));
      });
    });
    return out;
  }, [loaded]);
  const lines = useMemo(towerMaterial, []);
  return (
    <group position={[0, 0, 8]} rotation={[0, -0.34, 0]}>
      {geometries.map((g, i) => <mesh key={`f${i}`} geometry={g} material={fill} renderOrder={1} />)}
      {geometries.map((g, i) => <mesh key={`l${i}`} geometry={g} material={lines} renderOrder={2} />)}
    </group>
  );
}

function Land({ terrain }: { terrain: Terrain }) {
  const { gl } = useThree();
  const height = use(terrainFor(gl, terrain));
  useEffect(() => () => height.dispose(), [height]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(LAND_SIZE, LAND_SIZE, 300, 300).rotateX(-Math.PI / 2), []);
  const material = useMemo(() => landMaterial(height.texture, terrain), [height, terrain]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />;
}

function Embers() {
  const COUNT = 220;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * 6.283;
      const r = 3 + Math.random() * 30;
      seed.set([Math.cos(a) * r, Math.random(), Math.sin(a) * r], i * 3);
    }
    return g.setAttribute("position", new THREE.BufferAttribute(seed, 3));
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      uniform float uTime, uHigh; varying float vA;
      void main(){
        float t = fract(position.y + uTime * (0.012 + position.y * 0.012));
        vec3 p = vec3(position.x + sin(uTime * 0.4 + position.y * 40.0) * 1.2, t * 72.0, position.z + 8.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = sin(t * 3.1416) * (0.18 + uHigh * 0.95);
        gl_PointSize = (1.4 + uHigh * 2.2) * (240.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlow; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uGlow, vA * smoothstep(0.5, 0.1, d)); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

/** Turns what the music is doing into motion: smooth levels for breathing, sudden bass for ripples. */
function Conductor({ world, onDrawn }: { world: World; onDrawn: () => void }) {
  const state = useRef({ frames: 0, low: 0, high: 0, peakLow: 0.2, peakHigh: 0.2, before: 0, rush: 0, next: 0, wait: 0, ring: 0 });
  const { camera } = useThree();
  useEffect(() => {
    shared.uLine.value.set(LOOK[world].line);
    shared.uGlow.value.set(LOOK[world].glow);
    shared.uHighLine.value.set(LOOK[world].high);
  }, [world]);
  useFrame((three, rawDt) => {
    const s = state.current;
    const dt = Math.min(rawDt, 0.05);
    if (++s.frames === 3) onDrawn();
    const sound = soundLevels();
    // Tracks differ in loudness and in mood, so everything is measured against what this track has been doing lately.
    s.peakLow = Math.max(sound.low, s.peakLow * Math.exp(-dt / 7), 0.12);
    s.peakHigh = Math.max(sound.high, s.peakHigh * Math.exp(-dt / 7), 0.08);
    const low = sound.low / s.peakLow;
    const high = sound.high / s.peakHigh;
    s.low = THREE.MathUtils.damp(s.low, low * low, low * low > s.low ? 14 : 2.6, dt);
    s.high = THREE.MathUtils.damp(s.high, high * high, high * high > s.high ? 22 : 5, dt);
    // A beat is the bass rising much faster than it usually does, not simply being loud.
    const rise = Math.max(0, low - s.before);
    s.before = low;
    shared.uTime.value += dt * (1 + s.low * 0.7);
    shared.uLow.value = s.low;
    shared.uHigh.value = s.high;
    s.wait -= dt;
    s.next -= dt;
    const beat = sound.playing && rise > s.rush * 3 + 0.035 && s.wait <= 0;
    s.rush = THREE.MathUtils.damp(s.rush, rise, 1.2, dt);
    const idle = s.next <= 0;
    if (beat || idle) {
      const i = s.ring++ % RINGS;
      shared.uRing.value[i] = 8;
      shared.uRingA.value[i] = beat ? Math.min(0.55 + rise * 2, 1) : 0.55;
      s.wait = 0.28;
      s.next = sound.playing ? QUIET_PULSE : IDLE_PULSE;
    }
    for (let i = 0; i < RINGS; i++) {
      shared.uRing.value[i] += dt * 42;
      shared.uRingA.value[i] *= Math.exp(-dt * 0.75);
    }
    // A slow drift, and a little under the pointer, as if looking round the last shot.
    const t = three.clock.elapsedTime;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, -128 + Math.sin(t * 0.05) * 8 + three.pointer.x * 6, 1.6, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 148 + Math.sin(t * 0.07) * 3 - three.pointer.y * 4, 1.6, dt);
    camera.lookAt(-42, 14, 0);
  });
  return null;
}

function EndingWorld({ terrain, onReady, onLost, active }: { terrain: Terrain; onReady: () => void; onLost: () => void; active: boolean }) {
  const [world, setWorld] = useState<World>(() => (document.documentElement.dataset.theme === "space" ? "space" : "valley"));
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const watch = new MutationObserver(() => setWorld(root.dataset.theme === "space" ? "space" : "valley"));
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  const [dpr] = useState(() => Math.min(1.5, devicePixelRatio || 1));
  return (
    <Canvas
      flat
      dpr={dpr}
      frameloop={warm && active ? "always" : "never"}
      camera={{ position: [-128, 148, 205], fov: 34, near: 1, far: 900 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", onLost);
      }}
    >
      <Suspense fallback={null}>
        <Land terrain={terrain} />
        <Tower />
        <Embers />
        <Conductor world={world} onDrawn={onReady} />
        <Warmup onDone={() => setWarm(true)} />
      </Suspense>
    </Canvas>
  );
}

URLS.forEach((u) => useGLTF.preload(u, false, true));
export default memo(EndingWorld);
