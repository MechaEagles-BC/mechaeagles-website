/**
 * What moves on the moon in the space world. The dark is the point: everything here makes its own light.
 * A rocket launches now and then, with flame, a smoke column, a dust cloud and sparks; a ship crosses the sky; the convoy's engines burn; stars twinkle.
 * None of it is built until someone goes to space. The rocket is scenery, not a team vehicle.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ADDITIVE } from "./additive";
import { filmPoint } from "./filmPoint";
import { PORTAL, TEAMS, type Fx } from "./teams";

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

// ---------- one way to draw soft points with light only ----------
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SOFT_DOT = /* glsl */ `float softDot(){ vec2 p = gl_PointCoord - 0.5; return smoothstep(0.25, 0.0, dot(p, p)); }`;
const points = (uniforms: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, ...ADDITIVE, depthWrite: false, toneMapped: false });
const pixelScale = () => Math.min(devicePixelRatio, 1.75);

// ---------- the rocket ----------
const CYCLE = 40; // seconds from one launch to the next
const FIRST_LAUNCH = 34; // the first ignition comes about six seconds after arrival
const IGNITION = 2.4; // engines burn on the pad before it moves
const BURN = 15;
const PAD = filmPoint(0.405, 0.0, 70);
const SCALE = 0.9;
const CLIMB = 0.62; // metres per second squared, slow because it's far away and heavy
const DRIFT = 0.09; // it leans away from the convoy as it climbs

const HEIGHT_AT = /* glsl */ `
  uniform vec3 uPad;
  vec3 rocketAt(float t){ float a = max(t - ${IGNITION.toFixed(2)}, 0.0); float h = 0.5 * ${CLIMB.toFixed(3)} * a * a; return uPad + vec3(h * ${DRIFT.toFixed(3)} + h * h * 0.0006, h, 0.0); }
`;
const rocketAt = (t: number, out: THREE.Vector3) => {
  const a = Math.max(t - IGNITION, 0);
  const h = 0.5 * CLIMB * a * a;
  return out.copy(PAD).add(new THREE.Vector3(h * DRIFT + h * h * 0.0006, h, 0));
};

function rocketShape() {
  const body: [number, number][] = [[0.002, 5.6], [0.08, 5.4], [0.19, 5.0], [0.3, 4.3], [0.36, 3.5], [0.38, 2.6], [0.38, 0.5], [0.42, 0.28], [0.3, 0.05], [0.002, 0.05]];
  return new THREE.LatheGeometry(body.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), 18);
}

const flameMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime, uPower;
      void main(){ vUv = uv; vec3 p = position;
        float k = 1.0 - uv.y; // 0 at the nozzle, 1 at the tip
        p.xz *= 1.0 + sin(uTime * 41.0 + k * 19.0) * 0.1 * k + sin(uTime * 73.0 + k * 31.0) * 0.06 * k;
        p.y *= (0.55 + uPower * 0.55) * (1.0 + sin(uTime * 29.0) * 0.05 + sin(uTime * 53.0) * 0.04);
        vec4 w = modelMatrix * vec4(p, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime, uPower;
      void main(){
        float k = 1.0 - vUv.y;
        float nl = length(vN); // a cone's tip can carry a zero normal, and a NaN here would spread across the frame through bloom
        float core = nl > 1e-4 ? pow(abs(dot(vN / nl, vV)), 1.6) : 1.0;
        float shock = 0.72 + 0.28 * sin(k * 34.0 - uTime * 26.0);
        float fade = pow(clamp(1.0 - k, 0.0, 1.0), 1.5);
        vec3 hot = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.46, 0.1), smoothstep(0.08, 0.62, k));
        gl_FragColor = vec4(hot * core * fade * shock * uPower * 4.2, 1.0);
      }`,
    transparent: true,
    ...ADDITIVE,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

const SMOKE = 1500;
const SPARKS = 340;

function exhaustGeometry(count: number, seed: number) {
  const rand = seeded(seed);
  const g = new THREE.BufferGeometry();
  const a = new Float32Array(count * 4);
  const b = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 4; c++) a[i * 4 + c] = rand();
    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    b.set([dir.x, dir.y, dir.z], i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(a, 4));
  g.setAttribute("aDir", new THREE.BufferAttribute(b, 3));
  return g;
}

export function Rocket() {
  const hull = useMemo(rocketShape, []);
  const hullMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d9dbde", metalness: 0.2, roughness: 0.46, transparent: true }), []);
  const flame = useMemo(flameMaterial, []);
  const flameGeo = useMemo(() => new THREE.ConeGeometry(0.42, 5.2, 18, 12, true).translate(0, -2.6, 0).rotateX(Math.PI), []);
  const shared = useMemo(() => ({ uT: { value: -1 }, uPad: { value: PAD }, uPx: { value: pixelScale() } }), []);
  const smoke = useMemo(() => points(shared,
    /* glsl */ `attribute vec4 aSeed; attribute vec3 aDir; uniform float uT, uPx; varying float vAge; varying float vHeat; varying float vGround; ${HEIGHT_AT}
      void main(){
        // Every puff knows when it was born, so the whole column is one calculation with nothing stored between frames.
        float birth = aSeed.x * aSeed.x * ${BURN.toFixed(1)};
        float life = 5.0 + aSeed.y * 9.0;
        float age = uT - birth;
        vAge = age / life;
        if (age < 0.0 || vAge > 1.0) { gl_Position = vec4(2.0); gl_PointSize = 0.0; return; }
        vec3 from = rocketAt(birth);
        vGround = 1.0 - smoothstep(0.0, 2.2, birth - ${IGNITION.toFixed(2)});
        float grow = 1.0 - exp(-age * 0.7);
        vec3 p = from + aDir * (0.3 + grow * 3.4);
        // Close to the pad the blast has nowhere to go, so it rolls outward along the ground and hangs: there's no air to carry it off.
        p += vec3(aDir.x, abs(aDir.y) * 0.16, aDir.z) * grow * 11.0 * vGround;
        p.y -= (1.0 - vGround) * age * 0.34;
        vHeat = exp(-age * 2.6);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (9.0 + 58.0 * grow + vGround * 40.0 * grow) * (72.0 / -mv.z) * (0.6 + aSeed.z * 0.8);
      }`,
    /* glsl */ `varying float vAge; varying float vHeat; varying float vGround; ${SOFT_DOT}
      void main(){
        float fade = (1.0 - vAge) * (1.0 - vAge);
        vec3 smoke = mix(vec3(0.028, 0.03, 0.033), vec3(0.042, 0.04, 0.036), vGround);
        vec3 fire = vec3(1.0, 0.5, 0.14) * vHeat * 0.6;
        gl_FragColor = vec4((smoke + fire) * fade * softDot(), 1.0);
      }`), [shared]);
  const sparks = useMemo(() => points(shared,
    /* glsl */ `attribute vec4 aSeed; attribute vec3 aDir; uniform float uT, uPx; varying float vAge; varying float vHot; ${HEIGHT_AT}
      void main(){
        float birth = aSeed.x * ${(IGNITION + 2.2).toFixed(1)};
        float life = 1.4 + aSeed.y * 3.0;
        float age = uT - birth;
        vAge = age / life;
        if (age < 0.0 || vAge > 1.0) { gl_Position = vec4(2.0); gl_PointSize = 0.0; return; }
        // Thrown off low and fast, then falling slowly in the weak gravity. The curves are what make them read as sparks.
        vec3 v = vec3(aDir.x, abs(aDir.y) * 0.75 + 0.18, aDir.z) * (5.0 + aSeed.z * 13.0);
        vec3 p = uPad + v * age + vec3(0.0, -0.5 * 3.2 * age * age, 0.0);
        p.y = max(p.y, uPad.y - 0.2);
        vHot = aSeed.w;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (1.4 + aSeed.w * 2.2) * (1.0 + (1.0 - vAge) * 0.7);
      }`,
    /* glsl */ `varying float vAge; varying float vHot; ${SOFT_DOT}
      void main(){
        vec3 c = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.86, 0.55), vHot * (1.0 - vAge));
        gl_FragColor = vec4(c * (1.0 - vAge) * softDot() * 3.2, 1.0);
      }`), [shared]);
  const smokeGeo = useMemo(() => exhaustGeometry(SMOKE, 17), []);
  const sparkGeo = useMemo(() => exhaustGeometry(SPARKS, 91), []);
  const flash = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uI: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uI;
          void main(){ float d = length((vUv - 0.5) * vec2(1.0, 3.2)) * 2.0; float g = exp(-d * d * 7.0) + exp(-d * 2.6) * 0.16; gl_FragColor = vec4(vec3(1.0, 0.56, 0.2) * g * uI, 1.0); }`,
        transparent: true,
        ...ADDITIVE,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const body = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const clock = useRef(FIRST_LAUNCH);
  const pos = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDt) => {
    clock.current = (clock.current + Math.min(rawDt, 0.1)) % CYCLE;
    const t = clock.current;
    shared.uT.value = t;
    rocketAt(t, pos);
    const b = body.current!;
    b.position.copy(pos);
    const a = Math.max(t - IGNITION, 0);
    // It leans with its path once it's moving. Past the top of the sky it's gone, and a new one is standing on the pad before the next count.
    b.rotation.z = -Math.min(a * 0.012, 0.18);
    const gone = t > BURN + 1;
    const returning = t > CYCLE - 8 ? (t - (CYCLE - 8)) / 3 : 0;
    hullMat.opacity = gone ? Math.min(returning, 1) : 1;
    if (gone) b.position.copy(PAD);
    b.visible = !gone || returning > 0;
    const power = t < IGNITION ? THREE.MathUtils.smoothstep(t, 0, IGNITION * 0.8) * 0.75 : t < BURN ? 1 : 0;
    const flick = 0.86 + Math.sin(state.clock.elapsedTime * 47) * 0.08 + Math.sin(state.clock.elapsedTime * 83) * 0.06;
    flame.uniforms.uTime.value = state.clock.elapsedTime;
    flame.uniforms.uPower.value = power;
    flameRef.current!.visible = power > 0.01;
    const near = Math.max(0, 1 - a / 7);
    flash.uniforms.uI.value = power * near * flick * 1.5;
    // The light reaches the machine, so the launch lights the platform from behind.
    light.current!.position.copy(pos);
    light.current!.intensity = power * flick * (900 + near * 2600);
  });

  return (
    <>
      <group ref={body} position={PAD} scale={SCALE}>
        <mesh geometry={hull} material={hullMat} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 2 + 0.6, 0]} position={[Math.cos(0.6 + (i * Math.PI) / 2) * 0.4, 0.5, -Math.sin(0.6 + (i * Math.PI) / 2) * 0.4]} material={hullMat}>
            <boxGeometry args={[0.46, 0.85, 0.04]} />
          </mesh>
        ))}
        <mesh ref={flameRef} geometry={flameGeo} material={flame} position={[0, 0.05, 0]} renderOrder={5} />
      </group>
      <mesh position={[PAD.x, PAD.y + 0.1, PAD.z + 0.5]} material={flash} renderOrder={4}>
        <planeGeometry args={[44, 14]} />
      </mesh>
      <points geometry={smokeGeo} material={smoke} frustumCulled={false} renderOrder={3} />
      <points geometry={sparkGeo} material={sparks} frustumCulled={false} renderOrder={6} />
      <pointLight ref={light} position={[PAD.x, PAD.y, PAD.z]} color="#ff9a4d" intensity={0} distance={110} decay={1.6} />
    </>
  );
}

// ---------- the ship that crosses the sky ----------
const SHIP = "/models/ships/zenith.glb";
const CROSSING = 42; // slow, so it reads as far off and never pulls the eye for long
const REST = 26;
// Low across the sky, under the convoy in the picture and clear of the title and buttons at the top.
const FROM = new THREE.Vector3(70, -5.5, -118);
const TO = new THREE.Vector3(-70, -1.5, -118);
const ENGINES: [number, number][] = [[-0.42, 0.04], [0.42, 0.04]];

const engineMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vK; void main(){ vK = 0.5 + position.z * 0.5; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vK; uniform float uTime;
    void main(){ float nl = length(vN); float f = nl > 1e-4 ? pow(abs(dot(vN / nl, vV)), 2.0) : 1.0; float flick = 0.84 + 0.16 * sin(uTime * 37.0 + vK * 14.0); gl_FragColor = vec4(vec3(0.62, 0.92, 1.0) * f * vK * vK * 3.4 * flick, 1.0); }`,
  transparent: true,
  ...ADDITIVE,
  depthWrite: false,
  toneMapped: false,
});

export function Flyby() {
  const { scene } = useGLTF(SHIP);
  const group = useRef<THREE.Group>(null);
  const clock = useRef(CROSSING * 0.12); // already on its way, so the first visit to space shows it
  const stern = useMemo(() => new THREE.Box3().setFromObject(scene).min.z, [scene]);
  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).envMapIntensity = 2.4;
    });
  }, [scene]);
  useFrame((state, dt) => {
    clock.current = (clock.current + Math.min(dt, 0.1)) % (CROSSING + REST);
    engineMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    const k = clock.current / CROSSING;
    const g = group.current!;
    g.visible = k < 1;
    if (k < 1) g.position.lerpVectors(FROM, TO, k);
  });
  return (
    <group ref={group} rotation={[0.1, -Math.PI / 2 + 0.34, -0.22]} scale={0.8}>
      <primitive object={scene} />
      {ENGINES.map(([x, y]) => (
        <group key={x}>
          <mesh position={[x, y, stern - 1.1]} scale={[0.2, 0.2, 1.5]} material={engineMaterial} renderOrder={4}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
          {/* the exhaust it leaves behind, far longer and much fainter */}
          <mesh position={[x, y, stern - 8]} scale={[0.07, 0.07, 8]} material={engineMaterial} renderOrder={4}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- the sky: twinkling stars, a burning convoy and the odd meteor ----------
const STARS = 170;
const PLANET = { u: -0.39, v: 0.178, r: 0.2 }; // keeps stars off the planet and its ring; matches unreal/space_sky.py
// Where the engines of the convoy show in the picture, in film units, with their size.
const CONVOY: [number, number, number][] = [[0.1, 0.197, 8], [0.237, 0.204, 12], [0.232, 0.19, 9], [0.409, 0.269, 6]];

export function Sky() {
  const material = useMemo(
    () =>
      points({ uTime: { value: 0 }, uPx: { value: pixelScale() } },
        /* glsl */ `attribute vec3 aStar; uniform float uTime, uPx; varying float vI; varying float vBurn;
          void main(){
            vBurn = aStar.z > 2.0 ? 1.0 : 0.0;
            float flick = vBurn > 0.5
              ? 0.72 + 0.2 * sin(uTime * 31.0 + aStar.x) + 0.08 * sin(uTime * 67.0 + aStar.y)
              : pow(max(0.5 + 0.5 * sin(uTime * (0.5 + aStar.y * 1.6) + aStar.x), 0.0), 3.0);
            vI = flick;
            gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
            gl_PointSize = uPx * (vBurn > 0.5 ? aStar.z * (0.85 + flick * 0.3) : 1.6 + aStar.z * 2.6);
          }`,
        /* glsl */ `varying float vI; varying float vBurn; ${SOFT_DOT}
          void main(){ vec3 c = vBurn > 0.5 ? vec3(0.62, 0.92, 1.0) * 2.1 : vec3(1.0, 0.98, 0.94) * 0.95; gl_FragColor = vec4(c * vI * softDot(), 1.0); }`),
    [],
  );
  const geometry = useMemo(() => {
    const rand = seeded(29);
    const pos: number[] = [];
    const data: number[] = [];
    while (data.length < STARS * 3) {
      const u = -0.9 + rand() * 1.8;
      const v = 0.05 + rand() * 0.7;
      if (Math.hypot(u - PLANET.u, v - PLANET.v) < PLANET.r || v < 0.06 + Math.abs(u) * -0.1) continue;
      const p = filmPoint(u, v, 150);
      pos.push(p.x, p.y, p.z);
      data.push(rand() * 6.28, rand(), rand());
    }
    CONVOY.forEach(([u, v, size]) => {
      const p = filmPoint(u, v, 150);
      pos.push(p.x, p.y, p.z);
      data.push(rand() * 6.28, rand(), size);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aStar", new THREE.Float32BufferAttribute(data, 3));
    return g;
  }, []);
  const streak = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uK: { value: -1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uK;
          void main(){ float edge = smoothstep(0.5, 0.0, abs(vUv.y - 0.5)); float tail = pow(vUv.x, 3.0); gl_FragColor = vec4(vec3(0.9, 0.97, 1.0) * edge * tail * sin(clamp(uK, 0.0, 1.0) * 3.14159) * 1.7, 1.0); }`,
        transparent: true,
        ...ADDITIVE,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const meteor = useRef<THREE.Mesh>(null);
  const meteorClock = useRef(7);
  const start = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    meteorClock.current += Math.min(dt, 0.1);
    const m = meteor.current!;
    if (meteorClock.current > 17) {
      // A different patch of sky each time, always falling the same way.
      meteorClock.current = 0;
      const seed = state.clock.elapsedTime * 13.37;
      start.copy(filmPoint(-0.2 + (Math.sin(seed) * 0.5 + 0.5) * 0.6, 0.2 + (Math.cos(seed * 1.7) * 0.5 + 0.5) * 0.12, 140));
    }
    const k = meteorClock.current / 0.75;
    streak.uniforms.uK.value = k;
    m.visible = k < 1;
    if (k < 1) m.position.set(start.x - k * 13, start.y - k * 4.6, start.z);
  });
  return (
    <>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />
      <mesh ref={meteor} rotation={[0, 0, Math.atan2(4.6, 13)]} material={streak} visible={false} renderOrder={2}>
        <planeGeometry args={[11, 0.16]} />
      </mesh>
    </>
  );
}

// ---------- a card answers hover with its own colour: sparks that fall in space, seeds that float in the valley ----------
const BURST = 90;
const burstAttrs = () => exhaustGeometry(BURST, 53);

export function HoverBurst({ fx, floating }: { fx: RefObject<Fx>; floating: boolean }) {
  const uniforms = useMemo(() => ({ uAge: { value: 9 }, uOrigin: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() }, uPx: { value: pixelScale() }, uFloat: { value: floating ? 1 : 0 } }), [floating]);
  const material = useMemo(() => points(uniforms,
    /* glsl */ `attribute vec4 aSeed; attribute vec3 aDir; uniform float uAge, uPx, uFloat; uniform vec3 uOrigin; varying float vA;
      void main(){
        float age = uAge - aSeed.x * 0.2;
        vA = 1.0 - age / (0.9 + aSeed.y * 1.1);
        if (age < 0.0 || vA < 0.0) { gl_Position = vec4(2.0); gl_PointSize = 0.0; return; }
        vec3 v = vec3(aDir.x, abs(aDir.y) + 0.35, aDir.z) * (1.2 + aSeed.z * 3.4);
        vec3 fall = uFloat > 0.5 ? vec3(sin(age * 3.0 + aSeed.z * 6.0) * 0.25, age * 0.5, 0.0) : vec3(0.0, -2.8 * age * age, 0.0);
        vec3 p = uOrigin + v * age * (uFloat > 0.5 ? 0.45 : 1.0) + fall;
        p.y = max(p.y, 0.05);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (1.8 + aSeed.w * 2.6);
      }`,
    /* glsl */ `varying float vA; uniform vec3 uColor; ${SOFT_DOT}
      void main(){ gl_FragColor = vec4((uColor + vec3(0.35)) * vA * softDot() * 2.4, 1.0); }`), [uniforms]);
  const geometry = useMemo(burstAttrs, []);
  const last = useRef(-1);
  useFrame((_, dt) => {
    const f = fx.current!;
    if (f.hover !== last.current) {
      last.current = f.hover;
      if (f.hover >= 0) {
        const t = TEAMS[f.hover];
        // At the foot of the card, wherever the platform has carried it.
        const c = Math.cos(f.spin);
        const s = Math.sin(f.spin);
        const x = Math.cos(t.portalAngle) * PORTAL.radius;
        const z = -Math.sin(t.portalAngle) * PORTAL.radius;
        uniforms.uOrigin.value.set(x * c + z * s, 0.5, z * c - x * s);
        uniforms.uColor.value.set(t.color);
        uniforms.uAge.value = 0;
      }
    }
    uniforms.uAge.value += Math.min(dt, 0.05);
  });
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={6} />;
}
