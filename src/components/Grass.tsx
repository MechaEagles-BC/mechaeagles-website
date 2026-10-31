/**
 * Live grass around the rim, so the platform sits in the ground instead of on a picture of it.
 * One small clump, instanced, swaying in the vertex shader. It stays outside the turning platform.
 */
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 3400;
const INNER = 9.3; // starts under the plinth's edge, so no gap can show
const OUTER = 14.5;

function clump() {
  const position: number[] = [];
  const height: number[] = [];
  const index: number[] = [];
  const blades = [[-0.05, 0.02, 0.2, 1], [0.06, -0.03, -0.7, 0.8], [0.0, 0.05, 1.2, 0.65]];
  blades.forEach(([x, z, turn, tall]) => {
    const start = position.length / 3;
    const sx = Math.cos(turn);
    const sz = Math.sin(turn);
    for (let s = 0; s <= 3; s++) {
      const k = s / 3;
      const w = 0.045 * (1 - k * k);
      const bend = k * k * 0.14;
      position.push(x - sx * w + sz * bend, k * tall, z - sz * w - sx * bend, x + sx * w + sz * bend, k * tall, z + sz * w - sx * bend);
      height.push(k, k);
    }
    for (let s = 0; s < 3; s++) {
      const a = start + s * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("aHeight", new THREE.Float32BufferAttribute(height, 1));
  g.setIndex(index);
  return g;
}

const time = { value: 0 };
// The dusk capture dims its picture of the valley, so the grass has to fall with it.
const DUSK = import.meta.env.DEV && new URLSearchParams(location.search).has("lit") ? 0.28 : 1;

export default function Grass() {
  const { geometry, material, matrices } = useMemo(() => {
    let seed = 41;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dummy = new THREE.Object3D();
    const list: THREE.Matrix4[] = [];
    for (let i = 0; i < COUNT; i++) {
      const r = INNER + (OUTER - INNER) * Math.pow(rand(), 1.7); // thickest against the rim, thinning out into the meadow
      const a = rand() * Math.PI * 2;
      const fade = 1 - ((r - INNER) / (OUTER - INNER)) * 0.45;
      const scale = (0.3 + rand() * 0.32) * fade; // low, so it hugs the rim and never hides the machine
      dummy.position.set(Math.cos(a) * r, -0.02, Math.sin(a) * r);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(scale * 1.2, scale, scale * 1.2);
      dummy.updateMatrix();
      list.push(dummy.matrix.clone());
    }
    return {
      geometry: clump(),
      matrices: list,
      material: new THREE.ShaderMaterial({
        uniforms: { uTime: time },
        vertexShader: /* glsl */ `
          attribute float aHeight; varying float vH; varying float vTone; uniform float uTime;
          void main(){
            vH = aHeight;
            vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vTone = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
            float gust = sin(uTime * 1.1 + root.x * 0.35 + root.z * 0.22) * 0.6 + sin(uTime * 2.3 + root.x * 1.1) * 0.25;
            w.xz += vec2(0.11, 0.05) * gust * aHeight * aHeight;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          varying float vH; varying float vTone;
          void main(){
            vec3 root = vec3(0.06, 0.11, 0.03);
            vec3 tip = mix(vec3(0.17, 0.29, 0.07), vec3(0.25, 0.36, 0.09), vTone);
            gl_FragColor = vec4(mix(root, tip, smoothstep(0.0, 0.85, vH)) * ${DUSK.toFixed(2)}, 1.0);
          }`,
        side: THREE.DoubleSide,
      }),
    };
  }, []);
  useFrame((_, dt) => {
    time.value += Math.min(dt, 0.05);
  });
  return (
    <instancedMesh
      args={[geometry, material, COUNT]}
      frustumCulled={false}
      ref={(mesh) => {
        if (!mesh) return;
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
      }}
    />
  );
}
