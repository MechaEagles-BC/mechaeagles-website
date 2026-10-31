/**
 * The path of flames: one monument for each academic year, newest nearest, with history receding into the distance and one unlit torch waiting for the next class.
 * What stands at each monument comes from data/cohorts.json, so a new year needs no code. Valley at dusk or the moon, like the rest of the site.
 */
import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Prop, spot, SPACING, URL, useProp, type Piece, type World } from "./path";
import { LegacyLand, masonry } from "./LegacyLand";

export type Year = { term: string; label: string; banners: string[]; monument: Piece[] };

const WIND = { value: 0 };

/** A team's banner, in its colour. In the valley the cloth moves in the wind. On the moon it hangs dead still. */
function Banner({ color, at, yaw, stirs, tall }: { color: string; at: [number, number]; yaw: number; stirs: boolean; tall: boolean }) {
  const object = useProp(tall ? "Banner_1_Cloth" : "Banner_2_Cloth", 2.1);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a3322", roughness: 0.8 }), []);
  useMemo(() => {
    object.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        if (!m.name.startsWith("MI_Banner")) return m;
        const cloth = (m as THREE.MeshStandardMaterial).clone();
        cloth.color = new THREE.Color(color);
        cloth.emissive = new THREE.Color(color);
        cloth.emissiveIntensity = 0.32;
        cloth.side = THREE.DoubleSide;
        if (stirs) {
          cloth.onBeforeCompile = (shader) => {
            shader.uniforms.uWind = WIND;
            shader.vertexShader = shader.vertexShader
              .replace("#include <common>", "#include <common>\nuniform float uWind;")
              .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat w = sin(uWind * 1.7 + position.y * 3.0 + position.x * 2.0) * 0.5 + sin(uWind * 3.1 + position.y * 7.0) * 0.2;\ntransformed.z += w * 0.05 * smoothstep(1.0, -1.0, position.y);");
          };
          cloth.customProgramCacheKey = () => "banner-wind";
        }
        return cloth;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }, [object, color, stirs]);
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 1.75, -0.05]} material={wood}><cylinderGeometry args={[0.045, 0.06, 3.5, 7]} /></mesh>
      <mesh position={[0, 3.2, -0.05]} rotation={[0, 0, Math.PI / 2]} material={wood}><cylinderGeometry args={[0.035, 0.035, 1.25, 7]} /></mesh>
      <mesh position={[0, 3.56, -0.05]} material={wood}><coneGeometry args={[0.07, 0.16, 7]} /></mesh>
      <primitive object={object} position={[0, 1.08, 0]} />
    </group>
  );
}

const FLAME_FRAG = `
uniform float uTime, uPower; uniform vec3 uCore, uEdge; varying vec2 vUv;
float n(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float s(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(n(i), n(i+vec2(1,0)), f.x), mix(n(i+vec2(0,1)), n(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return s(p)*0.55 + s(p*2.1+3.1)*0.3 + s(p*4.3+7.7)*0.15; }
void main(){
  vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
  float t = uTime * 1.3;
  p.x += (fbm(vec2(p.y * 2.2 - t, p.x * 1.5)) - 0.5) * 0.62 * p.y;
  float width = (0.5 - p.y * 0.5) * smoothstep(0.0, 0.14, p.y) * (0.75 + uPower * 0.25);
  float body = smoothstep(width, width * 0.25, abs(p.x));
  float lick = fbm(vec2(p.x * 3.0, p.y * 3.4 - t * 1.7));
  float a = body * smoothstep(1.0, 0.25, p.y + (1.0 - lick) * 0.6);
  vec3 c = mix(uEdge, uCore, smoothstep(0.25, 0.85, a));
  gl_FragColor = vec4(c * (1.1 + uPower), a * clamp(uPower, 0.0, 1.0));
}`;
const FLAME_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.42)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function Flame({ world, power }: { world: World; power: { current: number } }) {
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const tex = useMemo(glowTexture, []);
  const space = world === "space";
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uTime: { value: Math.random() * 40 }, uPower: { value: 1 }, uCore: { value: new THREE.Color(space ? "#fff2d6" : "#fff0b8") }, uEdge: { value: new THREE.Color(space ? "#5fb4ff" : "#ff6a1c") } },
  }), [space]);
  useFrame(({ camera }, dt) => {
    material.uniforms.uTime.value += dt;
    material.uniforms.uPower.value = power.current;
    if (mesh.current) mesh.current.rotation.y = Math.atan2(camera.position.x - mesh.current.getWorldPosition(new THREE.Vector3()).x, camera.position.z - mesh.current.getWorldPosition(new THREE.Vector3()).z);
    const flicker = 0.9 + Math.sin(material.uniforms.uTime.value * 11) * 0.05 + Math.sin(material.uniforms.uTime.value * 23) * 0.04;
    if (light.current) light.current.intensity = 34 * power.current * flicker;
    if (glow.current) glow.current.material.opacity = 0.5 * Math.min(power.current, 1.4) * flicker;
  });
  return (
    <>
      <mesh ref={mesh} position={[0, 0.52, 0]} material={material}>
        <planeGeometry args={[0.95, 1.35]} />
      </mesh>
      <sprite ref={glow} position={[0, 0.25, 0]} scale={[2.6, 2.6, 1]}>
        <spriteMaterial map={tex} color={space ? "#8cc8ff" : "#ff9a4a"} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight ref={light} position={[0, 0.4, 0.3]} color={space ? "#bcdcff" : "#ffa45a"} distance={13} decay={1.8} />
    </>
  );
}

function yearPlate(label: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.font = `800 92px "Archivo Variable", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffd9a0";
  g.fillText(label, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Monument({ year, index, count, world, active, pick, lit }: { year: Year | null; index: number; count: number; world: World; active: boolean; pick: (i: number) => void; lit: boolean }) {
  const where = useMemo(() => spot(index, count), [index, count]);
  const torch = useProp("Torch_Metal", 1.05);
  const power = useRef(lit ? 0.7 : 0);
  const [hover, setHover] = useState(false);
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: world === "space" ? "#8d929b" : "#a0978a", roughness: 0.9, flatShading: true }), [world]);
  const plate = useMemo(() => (year ? yearPlate(year.label) : null), [year]);
  useFrame((_, dt) => {
    const goal = !lit ? 0 : active ? 1.25 : hover ? 1 : 0.68;
    power.current += (goal - power.current) * (1 - Math.exp(-dt * 3));
  });
  useEffect(() => {
    document.documentElement.style.cursor = hover ? "pointer" : "";
    return () => void (document.documentElement.style.cursor = "");
  }, [hover]);
  const banners = year?.banners ?? [];
  return (
    <group position={where}>
      <mesh position={[0, 0.16, 0]} material={stone}><cylinderGeometry args={[1.25, 1.42, 0.32, 8]} /></mesh>
      <mesh position={[0, 0.42, 0]} material={stone}><cylinderGeometry args={[0.92, 1.04, 0.22, 8]} /></mesh>
      <mesh position={[0, 1.06, 0]} material={masonry(world)}><boxGeometry args={[0.9, 1.08, 0.9]} /></mesh>
      <mesh position={[0, 1.64, 0]} material={stone}><cylinderGeometry args={[0.58, 0.5, 0.08, 8]} /></mesh>
      {plate && (
        <mesh position={[0, 1.08, 0.455]}>
          <planeGeometry args={[0.84, 0.263]} />
          <meshBasicMaterial map={plate} transparent toneMapped={false} />
        </mesh>
      )}
      <primitive object={torch} position={[0, 1.68, 0]} />
      <group position={[0, 2.72, 0]}>{lit && <Flame world={world} power={power} />}</group>
      {banners.map((color, i) => {
        // Team banners stand in an arc behind the flame, one for each team that existed that year.
        const a = banners.length === 1 ? -0.6 : -1.12 + (i / (banners.length - 1)) * 2.24;
        return <Banner key={i} color={color} at={[Math.sin(a) * 3.3, -Math.cos(a) * 3.3 + 0.3]} yaw={-a * 0.7} stirs={world === "valley"} tall={i % 2 === 0} />;
      })}
      {year?.monument.map((piece, i) => <Prop key={i} piece={piece} />)}
      {/* A generous target, so a flame in the distance can still be picked. */}
      <mesh position={[0, 1.8, 0]} visible={false} onClick={(e) => { e.stopPropagation(); pick(index); }} onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
        <cylinderGeometry args={[1.5, 1.5, 4.4, 8]} />
      </mesh>
    </group>
  );
}

/** The path, and the line of fire running along it: it comes from the first flame and stops at the newest one. */
function FireLine({ count, lit, world }: { count: number; lit: number; world: World }) {
  const { tube, line } = useMemo(() => {
    const litPts: THREE.Vector3[] = [];
    for (let i = 0; i <= lit; i += 0.1) litPts.push(spot(i, count));
    const lineCurve = litPts.length > 1 ? new THREE.CatmullRomCurve3(litPts) : null;
    return {
      tube: lineCurve ? new THREE.TubeGeometry(lineCurve, 240, 0.045, 5, false) : null,
      line: new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(world === "space" ? "#7cc4ff" : "#ff8a3a") } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float pulse = pow(0.5 + 0.5 * sin(vUv.x * 44.0 - uTime * 1.6), 6.0); gl_FragColor = vec4(uColor * (1.0 + pulse * 2.4), 0.45 + pulse * 0.55); }",
      }),
    };
  }, [count, lit, world]);
  useFrame((_, dt) => void (line.uniforms.uTime.value += dt));
  return tube ? <mesh geometry={tube} material={line} position={[0, 0.11, 0]} /> : null;
}

// Three tiers on a trunk, so a tree reads as a tree at any distance.
const pine = () => mergeGeometries([
  new THREE.CylinderGeometry(0.1, 0.14, 1, 6).translate(0, 0.5, 0),
  new THREE.ConeGeometry(1, 1.5, 7).translate(0, 1.5, 0),
  new THREE.ConeGeometry(0.78, 1.3, 7).translate(0, 2.3, 0),
  new THREE.ConeGeometry(0.52, 1.1, 7).translate(0, 3.1, 0),
])!;

/** The setting. The valley at dusk, with pines against the last light. Or dust and rocks on the moon, with the page's own stars above. */
function Setting({ world, length }: { world: World; length: number }) {
  const valley = world === "valley";
  const { scene } = useThree();
  const { matrices, geometry, material } = useMemo(() => {
    let seed = 29;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list: THREE.Matrix4[] = [];
    const d = new THREE.Object3D();
    for (let i = 0; i < (valley ? 110 : 150); i++) {
      const side = rand() > 0.5 ? 1 : -1;
      const z = 12 - rand() * (length + 60);
      const x = side * ((valley ? 25 : 10) + Math.pow(rand(), 1.3) * 46);
      d.position.set(x, valley ? 0 : -0.1, z);
      d.rotation.set(valley ? 0 : rand() * 3, rand() * 6, valley ? 0 : rand() * 3);
      const s = valley ? 1.6 + rand() * 1.5 : 0.3 + Math.pow(rand(), 3) * 2.4;
      d.scale.set(s, s * (valley ? 1.1 + rand() * 0.4 : 0.6), s);
      d.updateMatrix();
      list.push(d.matrix.clone());
    }
    return {
      matrices: list,
      geometry: valley ? pine() : new THREE.IcosahedronGeometry(1, 0),
      material: new THREE.MeshStandardMaterial({ color: valley ? "#1c2a1e" : "#3b3d42", roughness: 1, flatShading: true }),
    };
  }, [valley, length]);
  const instanced = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((m, i) => instanced.current?.setMatrixAt(i, m));
    if (instanced.current) instanced.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  const horizon = valley ? "#a9786c" : "#05070c";
  useEffect(() => {
    scene.fog = new THREE.Fog(horizon, valley ? 26 : 26, valley ? 120 : 100);
    return () => void (scene.fog = null);
  }, [scene, horizon, valley]);
  const dome = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec3 vP; void main(){ float h = max(vP.y, 0.0); vec3 c = mix(vec3(0.66, 0.47, 0.42), vec3(0.42, 0.26, 0.38), smoothstep(0.0, 0.16, h)); c = mix(c, vec3(0.09, 0.11, 0.24), smoothstep(0.12, 0.5, h)); vec3 q = floor(vP * 170.0); float st = fract(sin(dot(q, vec3(12.9, 78.2, 37.7))) * 43758.5); c += vec3(0.8, 0.85, 1.0) * step(0.9965, st) * smoothstep(0.18, 0.5, h); gl_FragColor = vec4(c, 1.0); }`,
  }), []);
  const camera = useThree((s) => s.camera);
  const domeRef = useRef<THREE.Mesh>(null);
  useFrame(() => void domeRef.current?.position.copy(camera.position));
  return (
    <>
      {valley && <mesh ref={domeRef} material={dome} renderOrder={-1}><sphereGeometry args={[150, 24, 12]} /></mesh>}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2]}>
        <planeGeometry args={[900, length + 900]} />
        <meshStandardMaterial color={valley ? "#2e3a22" : "#34363c"} roughness={1} />
      </mesh>
      <instancedMesh ref={instanced} args={[geometry, material, matrices.length]} frustumCulled={false} />
      <hemisphereLight args={[valley ? "#7d6f96" : "#7f90b0", valley ? "#2c2f1e" : "#18191d", valley ? 0.85 : 0.5]} />
      <directionalLight position={valley ? [-14, 9, -30] : [12, 16, 10]} intensity={valley ? 0.8 : 0.75} color={valley ? "#ffb27a" : "#dfe8ff"} />
      {/* A soft fill from where the visitor stands, so the near side of each monument never goes black. */}
      <directionalLight position={[-3, 5, 20]} intensity={valley ? 0.85 : 0.7} color={valley ? "#c9b6cf" : "#a9bcd8"} />
    </>
  );
}

/** Sparks in the air: fireflies in the valley, slow motes on the moon. */
function Motes({ world, length }: { world: World; length: number }) {
  const ref = useRef<THREE.Points>(null);
  const COUNT = 140;
  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = Math.random() * 3.6 + 0.2;
      pos[i * 3 + 2] = 10 - Math.random() * (length + 18);
      seed[i] = Math.random() * 40;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(world === "space" ? "#9fd0ff" : "#ffc36a") } },
      vertexShader: `attribute float aSeed; uniform float uTime; varying float vA; void main(){ vec3 p = position; p.x += sin(uTime * 0.3 + aSeed) * 0.6; p.y += sin(uTime * 0.23 + aSeed * 2.0) * 0.35; vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * 0.9 + aSeed * 3.0), 3.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 34.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA); }`,
    });
    return { geometry: g, material: m };
  }, [world, length]);
  useFrame((_, dt) => void (material.uniforms.uTime.value += dt));
  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />;
}

/** The camera, and the spark that carries the flame ahead of it from one year to another. */
function Journey({ target, count, onArrive }: { target: number; count: number; onArrive: () => void }) {
  const { camera, size } = useThree();
  const from = useRef(target);
  const to = useRef(target);
  const t = useRef(1);
  const pointer = useRef({ x: 0, y: 0, gx: 0, gy: 0 });
  const spark = useRef<THREE.Sprite>(null);
  const tex = useMemo(glowTexture, []);
  useEffect(() => {
    if (target === to.current) return;
    from.current = from.current + (to.current - from.current) * ease(t.current);
    to.current = target;
    t.current = 0;
  }, [target]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.gx = (e.clientX / innerWidth) * 2 - 1;
      pointer.current.gy = (e.clientY / innerHeight) * 2 - 1;
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const distance = Math.max(Math.abs(to.current - from.current), 0.5);
    const was = t.current;
    t.current = Math.min(1, t.current + dt / (2.4 + distance * 0.9));
    if (was < 1 && t.current === 1) onArrive();
    const e = ease(t.current);
    const at = from.current + (to.current - from.current) * e;
    const here = spot(at, count);
    const back = (wide: boolean) => (wide ? 8.4 : 10.5) / SPACING;
    const wide = size.width / size.height > 1.1;
    const p = pointer.current;
    p.x += (p.gx - p.x) * (1 - Math.exp(-dt * 1.6));
    p.y += (p.gy - p.y) * (1 - Math.exp(-dt * 1.6));
    const eye = spot(at + back(wide), count);
    // The view rises to pass over each flame and its banners, then comes down to go through the gate.
    const toFlame = Math.abs((at + back(wide) - Math.round(at + back(wide))) * SPACING);
    const lift = Math.exp(-((toFlame / 5.2) ** 2)) * 3;
    camera.position.set(eye.x + (wide ? -0.5 : 0) + p.x * 0.3, 2.35 + lift - p.y * 0.14, eye.z);
    look.set(here.x + (wide ? -2.0 : 0), 1.95 + lift * 0.15, here.z - 1);
    camera.lookAt(look);
    if (spark.current) {
      const moving = t.current < 1;
      const lead = from.current + (to.current - from.current) * ease(Math.min(1, t.current * 1.12));
      const s = spot(lead, count);
      spark.current.position.set(s.x, 2.9 + Math.sin(t.current * Math.PI) * 0.7, s.z);
      spark.current.material.opacity = moving ? Math.sin(t.current * Math.PI) : 0;
    }
  });
  return (
    <sprite ref={spark} scale={[1.3, 1.3, 1]}>
      <spriteMaterial map={tex} color="#ffc37a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>
  );
}
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function Wind() {
  useFrame((_, dt) => void (WIND.value += dt));
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current === 3) onReady();
  });
  return null;
}

function LegacyWorld({ years, start, pick, onArrive, onReady, onLost }: { years: Year[]; start: number; pick: (i: number) => void; onArrive: () => void; onReady: () => void; onLost: () => void }) {
  const [world, setWorld] = useState<World>(() => (document.documentElement.dataset.theme === "space" ? "space" : "valley"));
  const [target, setTarget] = useState(start);
  const [visible, setVisible] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const count = years.length + 1; // the unlit torch for the next class stands at the near end
  const length = count * SPACING;
  useEffect(() => {
    const root = document.documentElement;
    const watch = new MutationObserver(() => setWorld(root.dataset.theme === "space" ? "space" : "valley"));
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const go = (e: Event) => setTarget((e as CustomEvent<number>).detail);
    document.addEventListener("mc:year", go);
    const seen = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (host.current) seen.observe(host.current);
    return () => {
      watch.disconnect();
      seen.disconnect();
      document.removeEventListener("mc:year", go);
    };
  }, []);
  const [dpr] = useState(() => Math.max(1, Math.min(1.5, devicePixelRatio || 1)));
  return (
    <div ref={host} className="lw__canvas">
      <Canvas
        flat={false}
        dpr={dpr}
        frameloop={visible ? "always" : "never"}
        camera={{ fov: 44, near: 0.1, far: 620, position: [0, 3, 12] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.addEventListener("webglcontextlost", onLost);
        }}
      >
        <Suspense fallback={null}>
          <Setting world={world} length={length} />
          <LegacyLand count={count} world={world} />
          <FireLine count={count} lit={years.length - 1} world={world} />
          <Motes world={world} length={length} />
          {years.map((y, i) => <Monument key={y.term} year={y} index={i} count={count} world={world} active={target === i} pick={pick} lit />)}
          <Monument year={null} index={years.length} count={count} world={world} active={target === years.length} pick={pick} lit={false} />
          <Journey target={target} count={count} onArrive={onArrive} />
          <Wind />
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(URL, false, true);
export default memo(LegacyWorld);
