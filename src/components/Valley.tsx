/**
 * What moves in the valley that isn't part of its picture: a flock crossing the sky, seeds drifting through the light, and the wooden signpost.
 * The wind in the trees and the cloud shadows are in ValleyFx.tsx, which works on the picture itself.
 */
import { useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLASS } from "./additive";
import { filmPoint } from "./filmPoint";
import { SIGNS } from "./teams";

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

// ---------- seeds in the light ----------
const SEEDS = 130;

export function Seeds() {
  const { geometry, material } = useMemo(() => {
    const rand = seeded(67);
    const pos: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < SEEDS; i++) {
      pos.push(-22 + rand() * 44, 0.4 + rand() * 7, -16 + rand() * 30);
      seed.push(rand() * 6.28, 0.5 + rand(), rand());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 3));
    return {
      geometry: g,
      material: new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPx: { value: Math.min(devicePixelRatio, 1.75) } },
        vertexShader: /* glsl */ `attribute vec3 aSeed; uniform float uTime, uPx; varying float vA;
          void main(){
            float t = uTime * aSeed.y;
            vec3 p = position;
            // Carried along by the wind, wrapping round so there are always some in view.
            p.x = mod(p.x + 22.0 + t * 0.75, 44.0) - 22.0;
            p.y += sin(t * 0.5 + aSeed.x) * 0.9;
            p.z += cos(t * 0.37 + aSeed.x) * 0.8;
            vA = (0.4 + 0.6 * pow(max(0.5 + 0.5 * sin(t * 1.4 + aSeed.x), 0.0), 2.0)) * smoothstep(22.0, 17.0, abs(p.x));
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uPx * (1.5 + aSeed.z * 2.4) * (28.0 / -mv.z);
          }`,
        fragmentShader: `varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = smoothstep(0.25, 0.02, dot(p, p)); float a = d * vA * 0.86; gl_FragColor = vec4(vec3(1.0, 0.98, 0.86) * a, a); }`,
        transparent: true,
        ...GLASS,
        depthWrite: false,
        toneMapped: false,
      }),
    };
  }, []);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.05);
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------- the signpost: real links in the page, carried by boards in the world ----------
const POST = new THREE.Vector3(15.6, 0, -11.5);
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

export function Signpost({ linkRefs, hovered, pressed }: { linkRefs: RefObject<HTMLAnchorElement | null>[]; hovered: RefObject<number>; pressed: RefObject<number> }) {
  const { camera, size } = useThree();
  const side = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b4524", roughness: 0.95 }), []);
  const boards = useMemo(
    () =>
      SIGNS.map((s, i) => {
        const direction = s.points;
        return {
          ...s,
          geometry: arrowGeometry(direction),
          face: new THREE.MeshStandardMaterial({ map: plankTexture(s.label, direction, i + 1), roughness: 0.88, emissive: "#000000" }),
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
      const breeze = Math.sin(time.current * 1.1 + i * 1.9) * 0.012 + Math.sin(time.current * 2.7 + i * 0.7) * 0.006;
      g.rotation.y = b.yaw + m.swing + breeze;
      g.rotation.z = b.tilt + Math.sin(time.current * 1.6 + i * 2.3) * 0.006 * b.points;
      const lit = hovered.current === i ? 1 : 0;
      b.face.emissive.setRGB(0.1 * lit, 0.055 * lit, 0.015 * lit); // a little warmth, not enough to wash out the burnt letters
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
      <mesh position={[0, POST_HEIGHT / 2, 0]} castShadow material={side}>
        <cylinderGeometry args={[0.15, 0.19, POST_HEIGHT, 9]} />
      </mesh>
      <mesh position={[0, POST_HEIGHT + 0.06, 0]} material={side}>
        <coneGeometry args={[0.2, 0.26, 9]} />
      </mesh>
      {boards.map((b, i) => (
        <group key={b.label} ref={(el) => void (refs.current[i] = el)} position={[0, b.y, 0.2]} rotation={[0, b.yaw, b.tilt]}>
          <mesh geometry={b.geometry} material={[b.face, side]} castShadow />
        </group>
      ))}
    </group>
  );
}
