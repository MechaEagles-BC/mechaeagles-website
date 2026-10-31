/**
 * What flies over the moon in the space world. The moon itself never moves, and the stars are in sky.ts.
 * A carrier holds station with a small escort, and a third ship crosses now and then. They drift on slow curves, and their engines burn steadily.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ADDITIVE } from "./additive";
import { filmPoint } from "./filmPoint";

const STONES = 760;
const INNER = 9.3; // starts under the plinth's edge, so no gap can show
const OUTER = 14;

export function Regolith() {
  const { geometry, material, matrices } = useMemo(() => {
    let seed = 73;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dummy = new THREE.Object3D();
    const list: THREE.Matrix4[] = [];
    for (let i = 0; i < STONES; i++) {
      const r = INNER + (OUTER - INNER) * Math.pow(rand(), 1.9); // thickest against the rim, thinning out into the dust
      const a = rand() * Math.PI * 2;
      const s = (0.028 + Math.pow(rand(), 3) * 0.11) * (1 - ((r - INNER) / (OUTER - INNER)) * 0.5);
      dummy.position.set(Math.cos(a) * r, -0.01, Math.sin(a) * r);
      dummy.rotation.set(rand() * 3, rand() * 6, rand() * 3);
      dummy.scale.set(s * (0.8 + rand() * 0.7), s * (0.5 + rand() * 0.4), s * (0.8 + rand() * 0.7));
      dummy.updateMatrix();
      list.push(dummy.matrix.clone());
    }
    return {
      geometry: new THREE.IcosahedronGeometry(1, 0),
      material: new THREE.MeshStandardMaterial({ color: "#3b3d42", roughness: 0.95, metalness: 0, flatShading: true }),
      matrices: list,
    };
  }, []);
  return (
    <instancedMesh
      args={[geometry, material, STONES]}
      frustumCulled={false}
      castShadow
      receiveShadow
      ref={(mesh) => {
        if (!mesh) return;
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
      }}
    />
  );
}

const engineTime = { value: 0 };
const engineMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: engineTime },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vK; void main(){ vK = 0.5 + position.z * 0.5; vec4 w = modelMatrix * vec4(position,1.0); vN = mat3(modelMatrix) * normal; vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vK; uniform float uTime;
    void main(){ float nl = length(vN); float f = nl > 1e-4 ? pow(abs(dot(vN / nl, vV)), 2.2) : 1.0; float flick = 0.93 + 0.07 * sin(uTime * 23.0 + vK * 9.0); gl_FragColor = vec4(vec3(0.6, 0.9, 1.0) * f * vK * vK * 2.3 * flick, 1.0); }`,
  transparent: true,
  ...ADDITIVE,
  depthWrite: false,
  toneMapped: false,
});

/** The hull with its engines. Engines sit at the stern of the model, which is its lowest z. */
function Hull({ url, engines, flame }: { url: string; engines: [number, number][]; flame: number }) {
  const { scene } = useGLTF(url);
  const copy = useMemo(() => scene.clone(true), [scene]);
  const stern = useMemo(() => new THREE.Box3().setFromObject(copy).min.z, [copy]);
  useEffect(() => {
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).envMapIntensity = 2.6;
    });
  }, [copy]);
  return (
    <>
      <primitive object={copy} />
      {engines.map(([x, y]) => (
        <group key={`${x}${y}`}>
          <mesh position={[x, y, stern - flame * 0.5]} scale={[0.17 * flame, 0.17 * flame, flame]} material={engineMaterial} renderOrder={4}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
          {/* the long, faint burn behind the bright core */}
          <mesh position={[x, y, stern - flame * 2.3]} scale={[0.06 * flame, 0.06 * flame, flame * 2.6]} material={engineMaterial} renderOrder={4}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// Where each ship holds, in film position so it stays clear of the title and the planet, and how it's turned.
const HEADING: [number, number, number] = [-0.13, 2.1, 0.2];
const STATION = [
  { url: "/models/ships/imperial.glb", at: filmPoint(0.31, 0.205, 140), scale: 1.02, engines: [[-2.3, 0.5], [2.3, 0.5], [0, 0.9]] as [number, number][], flame: 1.25, wander: 0.9, phase: 0 },
  { url: "/models/ships/bob.glb", at: filmPoint(0.455, 0.27, 140), scale: 0.72, engines: [[-1.2, 0.1], [1.2, 0.1]] as [number, number][], flame: 0.6, wander: 1.5, phase: 1.9 },
];

function Holding({ s }: { s: (typeof STATION)[number] }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + s.phase * 11;
    const g = group.current!;
    // Slow curves that never quite repeat, with a bank into each turn: how something heavy holds position.
    const dx = Math.sin(t * 0.13) + Math.sin(t * 0.071 + 1.3) * 0.6;
    g.position.set(s.at.x + dx * s.wander, s.at.y + Math.sin(t * 0.21) * s.wander * 0.42, s.at.z + Math.cos(t * 0.09) * s.wander);
    g.rotation.set(HEADING[0] + Math.sin(t * 0.21 + 0.8) * 0.018, HEADING[1] + Math.cos(t * 0.13) * 0.035, HEADING[2] - Math.cos(t * 0.13) * 0.05);
  });
  return (
    <group ref={group} scale={s.scale}>
      <Hull url={s.url} engines={s.engines} flame={s.flame} />
    </group>
  );
}

const CROSSING = 64; // slow, so it reads as far off and never pulls the eye for long
const REST = 30;
// Below the carrier and clear of the title and buttons at the top. It leaves the frame before it turns round unseen.
const FROM = new THREE.Vector3(74, -4.5, -118);
const TO = new THREE.Vector3(-74, -0.5, -118);

function Crossing() {
  const group = useRef<THREE.Group>(null);
  const clock = useRef(CROSSING * 0.2); // already on its way, so a first visit to space shows it
  useFrame((_, dt) => {
    clock.current = (clock.current + Math.min(dt, 0.1)) % (CROSSING + REST);
    const k = clock.current / CROSSING;
    const g = group.current!;
    g.visible = k < 1;
    if (k < 1) {
      g.position.lerpVectors(FROM, TO, k);
      g.position.y += Math.sin(k * 7) * 0.7;
    }
  });
  return (
    <group ref={group} rotation={[0.1, -Math.PI / 2 + 0.34, -0.22]} scale={0.8}>
      <Hull url="/models/ships/zenith.glb" engines={[[-0.95, 0], [0.95, 0]]} flame={0.9} />
    </group>
  );
}

export function Fleet() {
  useFrame((state) => {
    engineTime.value = state.clock.elapsedTime;
  });
  return (
    <>
      {STATION.map((s) => <Holding key={s.url} s={s} />)}
      <Crossing />
    </>
  );
}
