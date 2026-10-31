/**
 * The valley's secret. A tiny figure wanders the far path, in sight of everyone and noticed by few: walking closer, poking at the grass, wandering back.
 * Point at him and he stops and waves. Click, and the memory opens (see founderMemory.ts). He's only in the valley, and only with live 3D.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { FILM } from "./teams";
import { filmPoint } from "./filmPoint";

const URL = "/valley/founder.glb";
const WALK_SECONDS = 32;
const HEIGHT = 1.9;
const tan = Math.tan((FILM.fov * Math.PI) / 360);

// The far stretch of the path, as seen in the picture at 1600 x 900, with how far each spot is from the lens.
const ROUTE: [number, number, number][] = [[1168, 232, 104], [1118, 256, 84], [1052, 290, 64], [992, 318, 53]];
const toWorld = ([x, y, d]: [number, number, number]) => filmPoint(((x / 1600 - 0.5) * 2) * tan * (FILM.w / FILM.h), (0.5 - (y + 150) / 1200) * 2 * tan, d);

export type FounderState = { hover: boolean; found: boolean };

export function Founder({ linkRef, state }: { linkRef: RefObject<HTMLButtonElement | null>; state: RefObject<FounderState> }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(URL, false, true);
  const { actions } = useAnimations(animations, group);
  const { camera, size } = useThree();
  const curve = useMemo(() => new THREE.CatmullRomCurve3(ROUTE.map(toWorld)), []);
  const model = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const scale = HEIGHT / Math.max(box.getSize(new THREE.Vector3()).y, 0.001);
    const tints: Record<string, string> = { Purple: "#6e1f2c", Skin: "#b98563", Hair: "#17120f", Eyebrows: "#17120f" };
    scene.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const c = tints[m.name];
        if (c) (m as THREE.MeshStandardMaterial).color.set(c);
      });
    });
    scene.scale.setScalar(scale);
    return scene;
  }, [scene]);
  const pick = (name: string) => Object.entries(actions).find(([k]) => k.split("|").pop() === name)?.[1] ?? null;
  const playing = useRef<THREE.AnimationAction | null>(null);
  const play = (name: string, fade = 0.4) => {
    const next = pick(name);
    if (!next || next === playing.current) return;
    next.reset().fadeIn(fade).play();
    playing.current?.fadeOut(fade);
    playing.current = next;
  };
  // Where he is in his day: along the route, which way he's heading, and how long until he moves on.
  const day = useRef({ t: 0.05, heading: 1, rest: 4, restAs: "Idle" });
  useEffect(() => play("Idle"), [actions]);
  const here = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const yaw = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const d = day.current;
    const s = state.current!;
    const noticing = s.hover || s.found;
    let goal = yaw.current;
    if (noticing) {
      play("Wave", 0.25);
      curve.getPointAt(d.t, here);
      goal = Math.atan2(camera.position.x - here.x, camera.position.z - here.z);
    } else if (d.rest > 0) {
      d.rest -= dt;
      play(d.restAs);
      curve.getPointAt(d.t, here);
    } else {
      play("Walk");
      d.t += (d.heading * dt) / WALK_SECONDS;
      if (d.t >= 0.98 || d.t <= 0.02) {
        // He comes closer, has a good look around, and then thinks better of it.
        d.t = Math.min(0.98, Math.max(0.02, d.t));
        d.heading *= -1;
        d.rest = 6 + Math.random() * 6;
        d.restAs = "Interact";
      } else if (Math.random() < dt / 22) {
        d.rest = 2 + Math.random() * 3;
        d.restAs = Math.random() < 0.5 ? "Idle" : "Interact"; // still searching
      }
      curve.getPointAt(d.t, here);
      curve.getPointAt(Math.min(0.999, Math.max(0.001, d.t + d.heading * 0.01)), ahead);
      goal = Math.atan2(ahead.x - here.x, ahead.z - here.z);
    }
    let delta = goal - yaw.current;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    yaw.current += delta * (1 - Math.exp(-dt * 5));
    const g = group.current;
    if (!g) return;
    g.position.copy(here);
    g.rotation.y = yaw.current;
    const el = linkRef.current;
    if (!el) return;
    // A real button stands over him, so he can be reached by keyboard and is a fair target for a pointer.
    head.copy(here).project(camera);
    const fx = ((head.x + 1) / 2) * size.width;
    const fy = ((1 - head.y) / 2) * size.height;
    head.copy(here).setY(here.y + HEIGHT).project(camera);
    const top = ((1 - head.y) / 2) * size.height;
    const h = Math.max(fy - top, 30);
    const w = Math.max(h * 0.9, 34);
    el.style.width = `${w}px`;
    el.style.height = `${h + 8}px`;
    el.style.transform = `translate(${fx - w / 2}px, ${fy - h - 4}px)`;
  });
  return (
    <group ref={group}>
      <primitive object={model} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial color="#14200c" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

useGLTF.preload(URL, false, true);
