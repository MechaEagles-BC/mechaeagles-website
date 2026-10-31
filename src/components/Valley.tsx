/**
 * What moves in the valley: real trees bending in the breeze, leaves coming down, a flock crossing the sky, and the wooden signpost.
 * Nothing here warps the picture. Everything that moves is a model in the world, and the grass is in Grass.tsx.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { filmPoint } from "./filmPoint";
import { SIGNS } from "./teams";
import { circuitFace, PylonColumn, pylonSide } from "./Pylon";

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- the flock ----------
const BIRDS = 11;
const CROSSING = 34;
const REST = 19;

export function Birds() {
  const { geometry, material, matrices } = useMemo(() => {
    const rand = seeded(11);
    const g = new THREE.BufferGeometry();
    // Two wings, hinged at the body. The shader lifts each by how far along it is.
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.12, -1, 0, -0.08, 0, 0, -0.16, 0, 0, 0.12, 0, 0, -0.16, 1, 0, -0.08], 3));
    const list: THREE.Matrix4[] = [];
    const phase: number[] = [];
    for (let i = 0; i < BIRDS; i++) {
      // A loose V, so it reads as a flock and not a formation.
      const side = i % 2 ? 1 : -1;
      const rank = Math.ceil(i / 2);
      list.push(new THREE.Matrix4().compose(new THREE.Vector3(side * rank * 1.5 + (rand() - 0.5) * 0.9, (rand() - 0.5) * 1.1 - rank * 0.55, (rand() - 0.5) * 2), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.34 + rand() * 0.12)));
      phase.push(rand() * 6.28);
    }
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array(phase), 1));
    return {
      geometry: g,
      matrices: list,
      material: new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `attribute float aPhase; uniform float uTime;
          void main(){ vec3 p = position; float beat = sin(uTime * 9.0 + aPhase) * 0.5 + sin(uTime * 0.7 + aPhase) * 0.45;
            p.y += abs(p.x) * beat * 0.9;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0); }`,
        fragmentShader: `void main(){ gl_FragColor = vec4(0.05, 0.07, 0.09, 1.0); }`,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    };
  }, []);
  const group = useRef<THREE.Group>(null);
  const clock = useRef(CROSSING * 0.55);
  const from = useMemo(() => filmPoint(-0.75, 0.2, 110), []);
  const to = useMemo(() => filmPoint(0.8, 0.28, 110), []);
  useFrame((_, dt) => {
    clock.current = (clock.current + Math.min(dt, 0.1)) % (CROSSING + REST);
    material.uniforms.uTime.value += Math.min(dt, 0.05);
    const k = clock.current / CROSSING;
    const g = group.current!;
    g.visible = k < 1;
    if (k < 1) g.position.lerpVectors(from, to, k).setY(g.position.y + Math.sin(k * 6) * 0.9);
  });
  return (
    <group ref={group} rotation={[0, -Math.PI / 2, 0]}>
      <instancedMesh
        args={[geometry, material, BIRDS]}
        frustumCulled={false}
        ref={(mesh) => {
          if (!mesh) return;
          matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
          mesh.instanceMatrix.needsUpdate = true;
        }}
      />
    </group>
  );
}

// ---------- the trees: real models, bending from the trunk, with leaves that also flutter ----------
const breeze = { value: 0 };
// The dusk capture dims its picture of the valley, so the trees have to fall with it.
const DUSK = import.meta.env.DEV && new URLSearchParams(location.search).has("lit");

function swayMaterial(source: THREE.MeshStandardMaterial) {
  const leaf = source.alphaTest > 0 || source.transparent || /leaf|leaves/i.test(source.name + (source.map?.name ?? ""));
  const m = new THREE.MeshStandardMaterial({
    map: source.map,
    side: THREE.DoubleSide,
    alphaTest: leaf ? 0.35 : 0,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.55,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: source.map,
    color: new THREE.Color(DUSK ? 0x24282c : 0xffffff),
    emissiveIntensity: (leaf ? 0.26 : 0.16) * (DUSK ? 0.06 : 1), // the valley's painted look: colour stays bright in shade
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uBreeze = breeze;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uBreeze;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
         vec3 rootAt = instanceMatrix[3].xyz;
         // A gust rolls across the valley, so neighbours lean one after another, not together.
         float wave = uBreeze * 0.9 - rootAt.x * 0.045 + rootAt.z * 0.03;
         float gust = 0.55 + 0.45 * sin(wave * 0.31) * sin(wave * 0.17 + 1.1);
         float lean = (sin(wave) * 0.7 + sin(wave * 2.17 + 0.7) * 0.3) * gust;
         // The higher up the tree, the further it moves. The trunk stays planted.
         float rise = transformed.y / 6.0;
         float bend = rise * rise;
         transformed.x += bend * lean * 0.2;
         transformed.z += bend * lean * 0.09 + bend * sin(wave * 0.63 + 0.9) * 0.05;
         ${leaf ? `float flutter = sin(uBreeze * 3.4 + position.x * 2.3 + position.y * 3.1 + position.z * 1.9);
         transformed += normal * flutter * 0.035 * (0.5 + gust) * min(rise, 1.0);
         transformed.y += flutter * 0.02 * (0.5 + gust);` : ""}`,
      );
  };
  m.customProgramCacheKey = () => (leaf ? "sway-leaf" : "sway-bark");
  return m;
}

export function Trees() {
  const { scene } = useGLTF("/valley/trees.glb", false, true);
  const [spots, setSpots] = useState<Record<string, number[][]> | null>(null);
  useEffect(() => {
    let stale = false;
    fetch("/valley/trees.json").then((r) => r.json()).then((d) => stale || setSpots(d)).catch(() => undefined);
    return () => {
      stale = true;
    };
  }, []);
  const batches = useMemo(() => {
    if (!spots) return [];
    const shared = new Map<THREE.Material, THREE.Material>();
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let owner: THREE.Object3D | null = mesh;
      while (owner && !Object.keys(spots).some((k) => owner!.name.startsWith(k))) owner = owner.parent;
      const key = owner && Object.keys(spots).find((k) => owner!.name.startsWith(k));
      if (!key) return;
      const source = mesh.material as THREE.MeshStandardMaterial;
      if (!shared.has(source)) shared.set(source, swayMaterial(source));
      // Each model was imported at the origin, so its own transform is the part to keep.
      // Compressed models store quantized attributes scaled by their node, so expand to floats before applying it.
      const geometry = new THREE.BufferGeometry();
      for (const attr of ["position", "normal", "uv"]) {
        const from = mesh.geometry.getAttribute(attr);
        if (!from) continue;
        const floats = new Float32Array(from.count * from.itemSize);
        for (let i = 0; i < from.count; i++) for (let c = 0; c < from.itemSize; c++) floats[i * from.itemSize + c] = from.getComponent(i, c);
        geometry.setAttribute(attr, new THREE.BufferAttribute(floats, from.itemSize));
      }
      geometry.setIndex(mesh.geometry.getIndex());
      geometry.applyMatrix4(mesh.matrixWorld);
      const q = new THREE.Quaternion();
      out.push({
        geometry,
        material: shared.get(source)!,
        matrices: spots[key].map(([x, y, z, yaw, s]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yaw * Math.PI) / 180).clone(), new THREE.Vector3(s, s, s))),
      });
    });
    return out;
  }, [scene, spots]);
  useFrame((_, dt) => {
    breeze.value += Math.min(dt, 0.05);
  });
  return (
    <>
      {batches.map((b, i) => (
        <instancedMesh
          key={i}
          args={[b.geometry, b.material, b.matrices.length]}
          frustumCulled={false}
          ref={(mesh) => {
            if (!mesh) return;
            b.matrices.forEach((m, n) => mesh.setMatrixAt(n, m));
            mesh.instanceMatrix.needsUpdate = true;
          }}
        />
      ))}
    </>
  );
}

// ---------- falling leaves: a few at a time, each turning as it comes down ----------
const LEAVES = 70;

export function FallingLeaves() {
  const { geometry, material } = useMemo(() => {
    const rand = seeded(67);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 0, -0.45, 0, 1, 0, 0, 0, 0.45, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const start: number[] = [];
    const seed: number[] = [];
    // They come down near the trees that drop them, not out of an empty sky.
    const GROVES = [[-19, -3, 6], [-24, -13, 6], [20, -25, 6], [25, -31, 6], [-46, -42, 12], [44, -74, 14]];
    for (let i = 0; i < LEAVES; i++) {
      const [cx, cz, r] = GROVES[Math.floor(rand() * GROVES.length)];
      start.push(cx + (rand() - 0.5) * r * 2, 9 + rand() * 8, cz + (rand() - 0.5) * r * 2);
      seed.push(rand() * 100, 0.7 + rand() * 0.6, rand());
    }
    g.setAttribute("aStart", new THREE.InstancedBufferAttribute(new Float32Array(start), 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seed), 3));
    g.instanceCount = LEAVES;
    return {
      geometry: g,
      material: new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `attribute vec3 aStart, aSeed; uniform float uTime; varying float vT; varying float vLight;
          void main(){
            float life = 15.0 * aSeed.y;
            float k = fract((uTime + aSeed.x) / life);
            vT = k;
            float t = k * life;
            // Swinging side to side as it falls and turning over, with the wind carrying it along.
            float swing = sin(t * 1.25 + aSeed.x) * 1.15;
            vec3 at = aStart + vec3(t * 0.62 + swing, -k * aStart.y, cos(t * 0.8 + aSeed.x) * 0.7);
            at.y = max(at.y, 0.03);
            float spin = t * (1.4 + aSeed.z);
            mat3 tumble = mat3(cos(spin), 0.0, sin(spin), 0.0, 1.0, 0.0, -sin(spin), 0.0, cos(spin));
            float flip = sin(t * 1.25 + aSeed.x);
            mat3 tip = mat3(1.0, 0.0, 0.0, 0.0, cos(flip), sin(flip), 0.0, -sin(flip), cos(flip));
            vLight = 0.72 + 0.28 * flip;
            gl_Position = projectionMatrix * viewMatrix * vec4(at + tumble * tip * position * 0.13, 1.0);
          }`,
        fragmentShader: /* glsl */ `varying float vT; varying float vLight;
          void main(){ float a = smoothstep(0.0, 0.05, vT) * (1.0 - smoothstep(0.93, 1.0, vT)); if (a < 0.5) discard;
            gl_FragColor = vec4(mix(vec3(0.42, 0.58, 0.16), vec3(0.74, 0.68, 0.24), step(0.7, fract(vT * 37.0))) * vLight, 1.0); }`,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    };
  }, []);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.05);
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------- the signpost: real links in the page, carried by boards in the world ----------
const POST = new THREE.Vector3(15.6, 0, -11.5); // beside the path, clear of the cards
const POST_HEIGHT = 8.9;
const BOARD_W = 4.5;
const BOARD_H = 1.02;
const FIRST_BOARD = 7.75;
const BOARD_STEP = 1.2;

function arrowGeometry(direction: 1 | -1) {
  // Square at the post end, pointed at the far end, with slightly uneven corners, as if cut by hand.
  const h = BOARD_H / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -h * 0.96);
  shape.lineTo(BOARD_W - 0.62, -h);
  shape.lineTo(BOARD_W, 0.02);
  shape.lineTo(BOARD_W - 0.6, h * 0.98);
  shape.lineTo(0.02, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, steps: 1 });
  const p = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / BOARD_W, (p.getY(i) + h) / BOARD_H);
  uv.needsUpdate = true;
  g.translate(0, 0, -0.07);
  if (direction < 0) g.rotateY(Math.PI); // the same board turned round, so its grain and face stay on the viewer's side
  return g;
}

function plankTexture(label: string, direction: 1 | -1, seed: number) {
  const w = 720;
  const h = 164;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const rand = seeded(seed * 991 + 7);
  g.fillStyle = `rgb(${176 + rand() * 18}, ${128 + rand() * 12}, ${76 + rand() * 10})`;
  g.fillRect(0, 0, w, h);
  // grain runs along the board, wavering, with a darker knot on some
  for (let i = 0; i < 70; i++) {
    const y = rand() * h;
    g.strokeStyle = `rgba(${rand() < 0.75 ? "78,44,18" : "226,184,126"}, ${0.07 + rand() * 0.2})`;
    g.lineWidth = 0.6 + rand() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 60) g.lineTo(x, y + Math.sin(x * 0.011 + i) * (2 + rand() * 3));
    g.stroke();
  }
  const kx = 80 + rand() * (w - 160);
  const ky = 30 + rand() * (h - 60);
  for (let r = 18; r > 2; r -= 3) {
    g.strokeStyle = "rgba(70, 38, 14, 0.34)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(kx, ky, r * 1.8, r * 0.8, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // dark edges, where the weather has got in
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, "rgba(48,26,10,0.42)");
  edge.addColorStop(0.16, "rgba(48,26,10,0)");
  edge.addColorStop(0.84, "rgba(48,26,10,0)");
  edge.addColorStop(1, "rgba(48,26,10,0.5)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  // The text is burnt in: a pale lower lip, then the dark letters. The canvas is mirrored for a board that faces the other way.
  g.save();
  if (direction < 0) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.font = `700 92px Georgia, "Times New Roman", serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const cx = direction > 0 ? w * 0.46 : w * 0.54;
  g.fillStyle = "rgba(244, 212, 160, 0.55)";
  g.fillText(label, cx, h / 2 + 7);
  g.fillStyle = "#26130a";
  g.fillText(label, cx, h / 2 + 4);
  g.restore();
  // two nails at the post end
  g.fillStyle = "#23201c";
  const nx = direction > 0 ? 26 : w - 26;
  [38, h - 38].forEach((y) => {
    g.beginPath();
    g.arc(nx, y, 6, 0, Math.PI * 2);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Signpost({ look, linkRefs, hovered, pressed }: { look: "wood" | "circuit"; linkRefs: RefObject<HTMLAnchorElement | null>[]; hovered: RefObject<number>; pressed: RefObject<number> }) {
  const circuit = look === "circuit";
  const { camera, size } = useThree();
  const side = useMemo(() => (circuit ? pylonSide() : new THREE.MeshStandardMaterial({ color: "#6b4524", roughness: 0.95 })), [circuit]);
  const boards = useMemo(
    () =>
      SIGNS.map((s, i) => {
        const direction = s.points;
        return {
          ...s,
          geometry: arrowGeometry(direction),
          face: circuit ? circuitFace(s.label, direction, i + 1) : new THREE.MeshStandardMaterial({ map: plankTexture(s.label, direction, i + 1), roughness: 0.88, emissive: "#000000" }),
          // Wood hangs a little crooked. Machined boards sit true.
          yaw: circuit ? s.yaw * 0.4 : s.yaw,
          tilt: circuit ? 0 : s.tilt,
          y: FIRST_BOARD - i * BOARD_STEP,
        };
      }),
    [side],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const motion = useRef(SIGNS.map(() => ({ swing: 0, speed: 0 })));
  const time = useRef(0);
  const ends = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    time.current += dt;
    boards.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      // Each board hangs on its own nail and has its own feel for the wind. Hover pushes it, and a spring brings it back.
      const m = motion.current[i];
      const goal = (hovered.current === i ? 0.22 * b.points : 0) + (pressed.current === i ? 0.42 * b.points : 0);
      m.speed += (goal - m.swing) * 52 * dt - m.speed * 5.2 * dt;
      m.swing += m.speed * dt;
      const breeze = circuit ? 0 : Math.sin(time.current * 1.1 + i * 1.9) * 0.012 + Math.sin(time.current * 2.7 + i * 0.7) * 0.006; // no wind on the moon
      g.rotation.y = b.yaw + m.swing * (circuit ? 0.5 : 1) + breeze;
      g.rotation.z = b.tilt + (circuit ? 0 : Math.sin(time.current * 1.6 + i * 2.3) * 0.006 * b.points);
      const lit = hovered.current === i ? 1 : 0;
      if (b.face instanceof THREE.ShaderMaterial) b.face.uniforms.uHover.value += (lit - b.face.uniforms.uHover.value) * Math.min(1, dt * 9);
      else b.face.emissive.setRGB(0.1 * lit, 0.055 * lit, 0.015 * lit); // a little warmth, not enough to wash out the burnt letters
      const el = linkRefs[i]?.current;
      if (!el) return;
      // The link covers the board, wherever it has swung to.
      g.localToWorld(ends[0].set(0, 0, 0)).project(camera);
      g.localToWorld(ends[1].set(BOARD_W * b.points, 0, 0)).project(camera);
      const x0 = ((ends[0].x + 1) / 2) * size.width;
      const x1 = ((ends[1].x + 1) / 2) * size.width;
      const y = ((1 - (ends[0].y + ends[1].y) / 2) / 2) * size.height;
      g.localToWorld(ends[2].set(0, BOARD_H / 2, 0)).project(camera);
      const height = Math.max(32, (((1 - ends[2].y) / 2) * size.height - y) * -2);
      el.style.width = `${Math.abs(x1 - x0)}px`;
      el.style.height = `${height}px`;
      el.style.transform = `translate(${Math.min(x0, x1)}px, ${y - height / 2}px)`;
    });
  });
  return (
    <group position={POST}>
      {circuit ? <PylonColumn height={POST_HEIGHT} /> : (
        <>
          <mesh position={[0, POST_HEIGHT / 2, 0]} castShadow material={side}>
            <cylinderGeometry args={[0.15, 0.19, POST_HEIGHT, 9]} />
          </mesh>
          <mesh position={[0, POST_HEIGHT + 0.06, 0]} material={side}>
            <coneGeometry args={[0.2, 0.26, 9]} />
          </mesh>
        </>
      )}
      {boards.map((b, i) => (
        <group key={b.label} ref={(el) => void (refs.current[i] = el)} position={[0, b.y, 0.2]} rotation={[0, b.yaw, b.tilt]}>
          <mesh geometry={b.geometry} material={[b.face, side]} castShadow />
        </group>
      ))}
    </group>
  );
}
