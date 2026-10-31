/**
 * The old country the road runs through: worn stone pavers, open gates between the years, a village with its lamps lit, and a castle far off where the road began.
 * The kit has props but no buildings, so the stonework and doors are drawn here, in its style. Lanterns, barrels and stalls are the kit's. Everything stays outdoors, under the sky.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heading, Prop, seeded, spot, SPACING, useProp, type World } from "./path";

const WIND = { value: 0 };

const painted: Partial<Record<World, THREE.MeshStandardMaterial>> = {};

/** Coursed masonry, painted once for each world: a colour map and a matching bump map. Repeats about every 4 metres. */
export function masonry(world: World) {
  if (painted[world]) return painted[world];
  const size = 1024;
  const color = document.createElement("canvas");
  const bump = document.createElement("canvas");
  color.width = color.height = bump.width = bump.height = size;
  const c = color.getContext("2d")!;
  const b = bump.getContext("2d")!;
  c.fillStyle = "#2a2723";
  c.fillRect(0, 0, size, size);
  b.fillStyle = "#000";
  b.fillRect(0, 0, size, size);
  const rand = seeded(91);
  const space = world === "space";
  const rows = 12;
  const h = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 90;
    while (x < size) {
      const w = 90 + rand() * 120;
      const shade = 96 + rand() * 62;
      const warm = space ? -4 : 8;
      c.fillStyle = `rgb(${shade + warm}, ${shade}, ${shade - warm * 1.6})`;
      c.beginPath();
      c.roundRect(x + 3, r * h + 3, w - 6, h - 6, 7);
      c.fill();
      // Weather and moss, a little at a time.
      for (let i = 0; i < 16; i++) {
        c.fillStyle = `rgba(${rand() > 0.5 ? "20,18,14" : "210,200,180"}, ${rand() * 0.07})`;
        c.beginPath();
        c.arc(x + rand() * w, r * h + rand() * h, 4 + rand() * 18, 0, 6.3);
        c.fill();
      }
      if (!space && rand() > 0.84) {
        c.fillStyle = "rgba(70, 92, 44, 0.34)";
        c.beginPath();
        c.ellipse(x + w / 2, r * h + h * 0.8, w * 0.42, h * 0.26, 0, 0, 6.3);
        c.fill();
      }
      const lift = 150 + rand() * 90;
      b.fillStyle = `rgb(${lift}, ${lift}, ${lift})`;
      b.beginPath();
      b.roundRect(x + 4, r * h + 4, w - 8, h - 8, 8);
      b.fill();
      x += w;
    }
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.25, 0.25); // shapes are measured in metres, so this makes the stones the same size everywhere
    t.anisotropy = 8;
  }
  return (painted[world] = new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 2.4, roughness: 0.95 }));
}

/** Old oak planks for doors. */
function oak() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const rand = seeded(47);
  const planks = 6;
  const w = 512 / planks;
  for (let i = 0; i < planks; i++) {
    const s = 58 + rand() * 26;
    g.fillStyle = `rgb(${s + 22}, ${s}, ${s - 22})`;
    g.fillRect(i * w, 0, w, 512);
    for (let n = 0; n < 34; n++) {
      g.strokeStyle = `rgba(20, 10, 4, ${rand() * 0.28})`;
      g.lineWidth = 1 + rand() * 2;
      const x = i * w + rand() * w;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + rand() * 8 - 4, 170, x + rand() * 8 - 4, 340, x, 512);
      g.stroke();
    }
    g.fillStyle = "rgba(10, 5, 2, 0.8)";
    g.fillRect(i * w - 2, 0, 4, 512);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(0.4, 0.3);
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.82 });
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

type Kit = { stone: THREE.Material; wood: THREE.Material; iron: THREE.Material; slate: THREE.Material; lit: THREE.Material; glow: THREE.Texture; warm: string };

// ---------- the road ----------

/** Worn pavers: rows laid along the road, thinning at the edges, and rings around each monument. */
function Pavers({ count, world }: { count: number; world: World }) {
  const { matrices, colors, geometry, material, earth } = useMemo(() => {
    const rand = seeded(17);
    const dummy = new THREE.Object3D();
    const m: THREE.Matrix4[] = [];
    const colorsList: THREE.Color[] = [];
    const space = world === "space";
    const tint = () => {
      const v = 0.2 + rand() * 0.17;
      const moss = !space && rand() > 0.9;
      return moss ? new THREE.Color(v * 0.72, v * 0.92, v * 0.52) : space ? new THREE.Color(v * 0.92, v * 0.95, v * 1.04) : new THREE.Color(v * 1.08, v, v * 0.86);
    };
    const put = (x: number, z: number, sx: number, sz: number, yaw: number) => {
      dummy.position.set(x, 0.035, z);
      dummy.rotation.set((rand() - 0.5) * 0.03, yaw, (rand() - 0.5) * 0.03);
      dummy.scale.set(sx, 0.07 + rand() * 0.03, sz);
      dummy.updateMatrix();
      m.push(dummy.matrix.clone());
      colorsList.push(tint());
    };
    const start = -0.82;
    const end = count - 1 + 0.72;
    const length = (end - start) * SPACING;
    const rows = Math.round(length / 0.5);
    for (let r = 0; r < rows; r++) {
      const t = start + ((end - start) * r) / rows;
      const p = spot(t, count);
      const yaw = heading(t, count);
      const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      let off = -2.3 + (r % 2 ? 0.28 : 0);
      while (off < 2.3) {
        const w = 0.46 + rand() * 0.42;
        const edge = Math.abs(off + w / 2) / 2.3;
        if (rand() > edge * edge * 0.75) {
          const at = p.clone().addScaledVector(across, off + w / 2);
          put(at.x, at.z, w * 0.96, 0.47, yaw + (rand() - 0.5) * 0.05);
        }
        off += w;
      }
    }
    for (let i = 0; i < count; i++) {
      const c = spot(i, count);
      for (let ring = 0; ring < 6; ring++) {
        const radius = 1.75 + ring * 0.62;
        const n = Math.round((radius * 6.283) / 0.72);
        for (let k = 0; k < n; k++) {
          if (ring === 5 && rand() > 0.62) continue;
          const a = ((k + (ring % 2) * 0.5) / n) * 6.283;
          put(c.x + Math.sin(a) * radius, c.z + Math.cos(a) * radius, 0.62, 0.56, a);
        }
      }
    }
    // Dark earth under the stones, so the gaps read as depth.
    const pts: number[] = [];
    const uvs: number[] = [];
    const steps = 160;
    for (let s = 0; s <= steps; s++) {
      const t = start + ((end - start) * s) / steps;
      const p = spot(t, count);
      const yaw = heading(t, count);
      pts.push(p.x - Math.cos(yaw) * 2.5, 0.012, p.z + Math.sin(yaw) * 2.5, p.x + Math.cos(yaw) * 2.5, 0.012, p.z - Math.sin(yaw) * 2.5);
      uvs.push(0, s / steps, 1, s / steps);
    }
    const index: number[] = [];
    for (let s = 0; s < steps; s++) {
      const a = s * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const strip = new THREE.BufferGeometry();
    strip.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    strip.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    strip.setIndex(index);
    strip.computeVertexNormals();
    return {
      matrices: m,
      colors: colorsList,
      geometry: new THREE.CylinderGeometry(0.5, 0.56, 1, 7),
      material: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, flatShading: true }),
      earth: strip,
    };
  }, [count, world]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((mat, i) => {
      ref.current?.setMatrixAt(i, mat);
      ref.current?.setColorAt(i, colors[i]);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, [matrices, colors]);
  return (
    <>
      <mesh geometry={earth}><meshStandardMaterial color={world === "space" ? "#1c1d21" : "#1e1a13"} roughness={1} side={THREE.DoubleSide} /></mesh>
      <instancedMesh ref={ref} args={[geometry, material, matrices.length]} frustumCulled={false} />
    </>
  );
}

// ---------- gates ----------

const WALL = 3.2; // half the gate's width
const SPRING = 2.45;
const OPEN = 2.2;

function archHole() {
  const hole = new THREE.Path();
  hole.moveTo(-OPEN, -0.01);
  hole.lineTo(-OPEN, SPRING);
  hole.absarc(0, SPRING, OPEN, Math.PI, 0, true);
  hole.lineTo(OPEN, -0.01);
  hole.closePath();
  return hole;
}

/** The wall of a gate, with battlements along the top and the arch cut through it. */
function gateGeometry() {
  const s = new THREE.Shape();
  const top = 5.05;
  s.moveTo(-WALL, -0.01);
  s.lineTo(-WALL, top);
  const merlons = 6;
  const w = (WALL * 2) / (merlons * 2 - 1);
  let x = -WALL;
  for (let i = 0; i < merlons; i++) {
    s.lineTo(x, top + 0.42);
    s.lineTo(x + w, top + 0.42);
    if (i < merlons - 1) {
      s.lineTo(x + w, top);
      s.lineTo(x + w * 2, top);
    }
    x += w * 2;
  }
  s.lineTo(WALL, top);
  s.lineTo(WALL, -0.01);
  s.closePath();
  s.holes.push(archHole());
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -0.5);
}

/** One leaf of a double door, arched at the top, hinged at its outer edge. */
function leafGeometry(side: 1 | -1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(OPEN * side, 0);
  s.lineTo(OPEN * side, SPRING + OPEN);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    s.lineTo((OPEN - Math.sin(a) * OPEN) * side, SPRING + Math.cos(a) * OPEN);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 8 });
}

function Lantern({ x, y, z, kit, yaw = 0 }: { x: number; y: number; z: number; kit: Kit; yaw?: number }) {
  const lamp = useProp("Lantern_Wall", 0.8);
  const glow = useRef<THREE.Sprite>(null);
  const seed = useMemo(() => x * 7.1 + z * 3.3, [x, z]);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.material.opacity = 0.62 + Math.sin(clock.elapsedTime * 2.6 + seed) * 0.08;
  });
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      <primitive object={lamp} />
      <sprite ref={glow} position={[0, 0.28, 0.1]} scale={[2.1, 2.1, 1]}>
        <spriteMaterial map={kit.glow} color={kit.warm} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

function Gate({ at, count, kit, open, geo }: { at: number; count: number; kit: Kit; open: boolean; geo: { wall: THREE.BufferGeometry; left: THREE.BufferGeometry; right: THREE.BufferGeometry; band: THREE.BufferGeometry } }) {
  const p = useMemo(() => spot(at, count), [at, count]);
  const yaw = useMemo(() => heading(at, count), [at, count]);
  const swing = open ? 1.28 : 0;
  return (
    <group position={p} rotation={[0, yaw, 0]}>
      <mesh geometry={geo.wall} material={kit.stone} />
      {/* The doors stand open between years, as if someone just came through. */}
      <group position={[-OPEN, 0, -0.42]} rotation={[0, -swing, 0]}>
        <mesh geometry={geo.left} material={kit.wood} />
        {[0.6, 1.85].map((y) => <mesh key={y} position={[OPEN * 0.46, y, 0.13]} geometry={geo.band} material={kit.iron} />)}
      </group>
      <group position={[OPEN, 0, -0.42]} rotation={[0, swing, 0]}>
        <mesh geometry={geo.right} material={kit.wood} />
        {[0.6, 1.85].map((y) => <mesh key={y} position={[-OPEN * 0.46, y, 0.13]} geometry={geo.band} material={kit.iron} />)}
      </group>
      <Lantern x={-2.7} y={2.1} z={0.56} kit={kit} />
      <Lantern x={2.7} y={2.1} z={0.56} kit={kit} />
      {/* Old walls running off from the gate, broken down a little more the further they go. */}
      {[-1, 1].map((side) => [1.9, 1.15, 1.55, 0.7, 0.4].map((h, n) => (
        <mesh key={`${side}${n}`} position={[side * (WALL + 0.8 + n * 1.6), h / 2, n % 2 ? 0.08 : -0.05]} material={kit.stone}>
          <boxGeometry args={[1.6, h, 0.7]} />
        </mesh>
      )))}
    </group>
  );
}

// ---------- the village ----------

function houseGeometry() {
  const w = 2.6;
  const h = 3;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, h);
  s.lineTo(0, h + 2.1);
  s.lineTo(-w, h);
  s.closePath();
  const door = new THREE.Path();
  door.moveTo(-0.7, 0.001);
  door.lineTo(-0.7, 1.55);
  door.absarc(0, 1.55, 0.7, Math.PI, 0, true);
  door.lineTo(0.7, 0.001);
  door.closePath();
  s.holes.push(door);
  for (const x of [-1.7, 1.7]) {
    const win = new THREE.Path();
    win.moveTo(x - 0.34, 1.5);
    win.lineTo(x - 0.34, 2.15);
    win.absarc(x, 2.15, 0.34, Math.PI, 0, true);
    win.lineTo(x + 0.34, 1.5);
    win.closePath();
    s.holes.push(win);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 4.6, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -4.6);
}

function roofGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-3.05, 2.72);
  s.lineTo(0, 5.45);
  s.lineTo(3.05, 2.72);
  s.lineTo(2.75, 2.72);
  s.lineTo(0, 5.05);
  s.lineTo(-2.75, 2.72);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 5.2, bevelEnabled: false }).translate(0, 0, -4.9);
}

function House({ x, z, yaw, kit, geo, lamp }: { x: number; z: number; yaw: number; kit: Kit; geo: { house: THREE.BufferGeometry; roof: THREE.BufferGeometry; door: THREE.BufferGeometry; pane: THREE.BufferGeometry }; lamp: boolean }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <mesh geometry={geo.house} material={kit.stone} />
      <mesh geometry={geo.roof} material={kit.slate} />
      <mesh geometry={geo.door} material={kit.wood} position={[0, 0, -0.14]} />
      {[-1.7, 1.7].map((wx) => <mesh key={wx} geometry={geo.pane} material={kit.lit} position={[wx, 1.98, -0.16]} />)}
      {lamp && <Lantern x={1.02} y={1.9} z={0.05} kit={kit} />}
    </group>
  );
}

/** The castle where the road began: far off and simple, with a few windows still lit. It ignores the mist, so it stands out against the last light. */
function Castle({ count, world }: { count: number; world: World }) {
  const where = useMemo(() => spot(-0.8, count), [count]);
  const space = world === "space";
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: space ? "#141720" : "#33273a", fog: false }), [space]);
  const win = useMemo(() => new THREE.MeshBasicMaterial({ color: space ? "#a8d4ff" : "#ffbe72", fog: false, toneMapped: false }), [space]);
  const towers: [number, number, number, number][] = [[-28, 34, 5, 1], [-14, 26, 4, 0], [0, 44, 6.4, 1], [15, 30, 4.4, 1], [31, 24, 4, 0]];
  return (
    <group position={[where.x + 34, -6, where.z - 190]} scale={0.8}>
      <mesh material={mat} position={[0, 0, 0]} scale={[2.3, 0.42, 0.8]}><sphereGeometry args={[60, 20, 10]} /></mesh>
      <mesh material={mat} position={[1, 19, 0]}><boxGeometry args={[62, 16, 8]} /></mesh>
      {towers.map(([x, h, r, cap]) => (
        <group key={x} position={[x, 12, 0]}>
          <mesh material={mat} position={[0, h / 2, 0]}><cylinderGeometry args={[r, r * 1.14, h, 10]} /></mesh>
          {cap ? <mesh material={mat} position={[0, h + r * 1.2, 0]}><coneGeometry args={[r * 1.26, r * 2.4, 10]} /></mesh> : null}
          {[0.55, 0.78].map((f) => <mesh key={f} material={win} position={[0, h * f, r * 0.98]}><planeGeometry args={[0.8, 1.7]} /></mesh>)}
        </group>
      ))}
    </group>
  );
}

// ---------- what lies about ----------

/** Kit props placed by the road, the way things get left in a place people still use. */
function Roadside({ count }: { count: number }) {
  const pieces = useMemo(() => {
    const SETS = [
      [{ prop: "Table_Large", d: 4.6, a: 0, h: 0.82, yaw: 0 }, { prop: "Barrel", d: 4.3, a: 0.13, h: 0.9, yaw: 0.3 }, { prop: "Crate_Wooden", d: 4.4, a: 0.2, h: 0.62, yaw: 0.8 }],
      [{ prop: "Barrel_Holder", d: -4.6, a: -0.14, h: 1.05, yaw: -1.3 }, { prop: "Crate_Metal", d: -4.2, a: 0.05, h: 0.6, yaw: 0.6 }],
      [{ prop: "Bench", d: 4, a: 0.03, h: 0.48, yaw: 1.57 }, { prop: "Barrel", d: 4.5, a: 0.13, h: 0.9, yaw: 1.1 }, { prop: "Rope_1", d: 3.8, a: -0.05, h: 0.26, yaw: 0.4 }],
    ];
    const out: { prop: string; at: [number, number]; height: number; yaw: number }[] = [];
    for (let i = 0; i < count; i++) {
      for (const [n, base] of [[0, i + 0.27], [1, i + 0.73]] as const) {
        if (base > count - 1 + 0.2) continue;
        const set = SETS[(i * 2 + n) % SETS.length];
        const flip = (i + n) % 2 ? 1 : -1;
        for (const piece of set) {
          const t = base + piece.a * 0.5;
          const p = spot(t, count);
          const yaw = heading(t, count);
          const d = piece.d * flip;
          out.push({ prop: piece.prop, at: [p.x + Math.cos(yaw) * d, p.z - Math.sin(yaw) * d], height: piece.h, yaw: piece.yaw * (flip > 0 ? 1 : -1) });
        }
      }
    }
    return out;
  }, [count]);
  return <>{pieces.map((piece, i) => <Prop key={i} piece={piece} />)}</>;
}

/** Tufts along the road and walls, moving in the valley's wind. */
function Grass({ count }: { count: number }) {
  const { geometry, material, matrices } = useMemo(() => {
    const pos: number[] = [];
    const pick = seeded(7);
    for (let b = 0; b < 6; b++) {
      const a = pick() * Math.PI;
      const c = Math.cos(a) * 0.035;
      const s = Math.sin(a) * 0.035;
      const ox = (pick() - 0.5) * 0.28;
      const oz = (pick() - 0.5) * 0.28;
      const h = 0.65 + pick() * 0.35;
      pos.push(ox - c, 0, oz - s, ox + c, 0, oz + s, ox + (pick() - 0.5) * 0.12, h, oz + (pick() - 0.5) * 0.12);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: "#6f8238", roughness: 1, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = WIND;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uWind;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvec4 w0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float gust = sin(uWind * 1.3 + w0.x * 0.5 + w0.z * 0.34) * 0.5 + 0.5; transformed.x += position.y * position.y * (0.03 + gust * 0.12);");
    };
    m.customProgramCacheKey = () => "legacy-grass";
    const rand = seeded(53);
    const d = new THREE.Object3D();
    const list: THREE.Matrix4[] = [];
    const start = -0.8;
    const end = count - 1 + 0.7;
    const flames = Array.from({ length: count }, (_, i) => spot(i, count));
    for (let i = 0; i < 9000; i++) {
      const t = start + rand() * (end - start);
      const p = spot(t, count);
      const yaw = heading(t, count);
      const off = (rand() > 0.5 ? 1 : -1) * (2.5 + Math.pow(rand(), 1.5) * 16);
      const x = p.x + Math.cos(yaw) * off;
      const z = p.z - Math.sin(yaw) * off;
      if (flames.some((f) => Math.hypot(f.x - x, f.z - z) < 5.5)) continue;
      d.position.set(x, 0, z);
      d.rotation.set(0, rand() * 6.3, 0);
      const s = 0.8 + rand() * 0.9;
      d.scale.set(s, s * (0.45 + rand() * 0.45), s);
      d.updateMatrix();
      list.push(d.matrix.clone());
    }
    return { geometry: g, material: m, matrices: list };
  }, [count]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((mat, i) => ref.current?.setMatrixAt(i, mat));
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  useFrame((_, dt) => void (WIND.value += dt));
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} frustumCulled={false} />;
}

export function LegacyLand({ count, world }: { count: number; world: World }) {
  const kit = useMemo<Kit>(() => {
    const space = world === "space";
    return {
      stone: masonry(world),
      wood: oak(),
      iron: new THREE.MeshStandardMaterial({ color: "#26272a", metalness: 0.7, roughness: 0.55 }),
      slate: new THREE.MeshStandardMaterial({ color: space ? "#23262d" : "#2d2a30", roughness: 0.9, flatShading: true }),
      lit: new THREE.MeshBasicMaterial({ color: space ? "#a8d4ff" : "#ffb765", toneMapped: false }),
      glow: glowTexture(),
      warm: space ? "#8cc8ff" : "#ffa95a",
    };
  }, [world]);
  const gateGeo = useMemo(() => ({ wall: gateGeometry(), left: leafGeometry(1), right: leafGeometry(-1), band: new THREE.BoxGeometry(OPEN * 0.88, 0.1, 0.02) }), []);
  const houseGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.7, 0);
    s.lineTo(0.7, 0);
    s.lineTo(0.7, 1.55);
    s.absarc(0, 1.55, 0.7, 0, Math.PI, false);
    s.lineTo(-0.7, 0);
    return { house: houseGeometry(), roof: roofGeometry(), door: new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 8 }), pane: new THREE.PlaneGeometry(0.68, 1.1) };
  }, []);
  const houses = useMemo(() => {
    const rand = seeded(203);
    const out: { x: number; z: number; yaw: number; lamp: boolean }[] = [];
    for (let i = -0.9; i < count - 0.4; i += 0.21) {
      const side = out.length % 2 ? 1 : -1;
      const p = spot(i, count);
      const x = p.x + side * (13.5 + rand() * 9);
      // Each house faces the road, more or less.
      out.push({ x, z: p.z + rand() * 3, yaw: side > 0 ? -1.2 - rand() * 0.5 : 1.2 + rand() * 0.5, lamp: rand() > 0.45 });
    }
    return out;
  }, [count]);
  return (
    <>
      <Pavers count={count} world={world} />
      {Array.from({ length: count - 1 }, (_, i) => <Gate key={i} at={i + 0.5} count={count} kit={kit} open geo={gateGeo} />)}
      {/* Beyond the first flame the road ends at doors that stay shut. Nobody's history goes back further than this. */}
      <Gate at={-0.5} count={count} kit={kit} open={false} geo={gateGeo} />
      {houses.map((h, i) => <House key={i} {...h} kit={kit} geo={houseGeo} />)}
      <Castle count={count} world={world} />
      <Roadside count={count} />
      {world === "valley" && <Grass count={count} />}
    </>
  );
}
