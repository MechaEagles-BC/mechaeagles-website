/**
 * Prepares shaders in the background. Compiling them on first use froze the whole page for about 5 seconds on a first visit, so here the browser compiles them on other threads
 * while the page stays responsive, and nothing draws with a shader until it's finished. Browsers without background compiling simply prepare them as before.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

const GIVE_UP_AFTER = 15000; // never leave the visitor waiting on a compile that won't report back

/**
 * The metal's reflections are worked out by shaders inside three.js, the slowest taking over 2 s to compile. Compile them in the background as soon as the canvas exists, and the reflections wait for
 * this before being made. It leans on three's private names, so if they ever change this quietly does nothing and the reflections just freeze the page for that time, as they used to.
 */
const keepCompiled: unknown[] = [];
export function warmReflections(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, faceSize: number) {
  try {
    const pmrem = new THREE.PMREMGenerator(gl) as unknown as { _setSize(n: number): void; _allocateTargets(): THREE.WebGLRenderTarget; _ggxMaterial: THREE.Material; _blurMaterial: THREE.Material };
    pmrem._setSize(faceSize);
    pmrem._allocateTargets().dispose();
    const stand = new THREE.Group();
    // Positions only, like the planes three draws them on: a shader is prepared for exactly the attributes it will be used with.
    const plane = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    stand.add(new THREE.Mesh(plane, pmrem._ggxMaterial), new THREE.Mesh(plane, pmrem._blurMaterial));
    keepCompiled.push(pmrem); // a compiled shader stays only while something still holds it
    // They draw into an off-screen buffer, so that's the version to prepare.
    const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    gl.setRenderTarget(buffer);
    const done = gl.compileAsync(stand, camera, scene);
    gl.setRenderTarget(null);
    buffer.dispose();
    return Promise.race([done, new Promise((r) => setTimeout(r, GIVE_UP_AFTER))]);
  } catch {
    return Promise.resolve(); // the reflections are simply prepared the slower way
  }
}

/**
 * The two worlds' reflections differ in size, which needs a different version of every metal shader, and a first change of world used to freeze the page while they compiled.
 * Once the world is running, the other world's versions are prepared in the background on stand-in copies that are never drawn, so what's on screen isn't touched.
 */
export async function warmOtherWorld(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, faceSize: number) {
  try {
    await warmReflections(gl, camera, scene, faceSize);
    // The shaders only need to know how big the reflections will be, so this stands in for them.
    const light = new THREE.Texture();
    light.mapping = THREE.CubeUVReflectionMapping;
    light.image = { width: 3 * Math.max(faceSize, 112), height: 4 * faceSize };
    // One shader version per tick, so getting ready never interrupts the moving scene.
    const seen = new Set<string>();
    const waiting: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || !material?.isMeshStandardMaterial) return;
      const instanced = !!(mesh as THREE.InstancedMesh).isInstancedMesh;
      const kind = [material.type, material.customProgramCacheKey(), instanced, !!material.map, !!material.normalMap, !!material.aoMap, material.transparent, material.side, !!mesh.geometry.getAttribute("uv"), !!mesh.geometry.getAttribute("normal")].join();
      if (seen.has(kind)) return;
      seen.add(kind);
      const copy = material.clone();
      copy.onBeforeCompile = material.onBeforeCompile;
      copy.customProgramCacheKey = material.customProgramCacheKey;
      waiting.push(instanced ? new THREE.InstancedMesh(mesh.geometry, copy, 1) : new THREE.Mesh(mesh.geometry, copy));
    });
    keepCompiled.push(waiting);
    const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const next = () => {
      const stand = waiting[stood++];
      if (!stand) return buffer.dispose();
      const had = scene.environment;
      scene.environment = light;
      gl.setRenderTarget(buffer);
      void gl.compileAsync(stand, camera, scene);
      gl.setRenderTarget(null);
      scene.environment = had;
      setTimeout(next, 80);
    };
    let stood = 0;
    next();
  } catch {
    // the first change of world just takes a moment, as it used to
  }
}

function useCompile(through: boolean) {
  const { gl, camera, scene } = useThree();
  return (what: THREE.Object3D) => {
    // A scene drawn through post-processing writes to an off-screen buffer, which needs a different version of each shader, so prepare the version that will be used.
    const previous = gl.getRenderTarget();
    const buffer = through ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
    if (buffer) gl.setRenderTarget(buffer);
    const done = gl.compileAsync(what, camera, scene);
    if (buffer) gl.setRenderTarget(previous);
    buffer?.dispose();
    return Promise.race([done, new Promise((r) => setTimeout(r, GIVE_UP_AFTER))]);
  };
}

/** Sits after the assets in a Suspense boundary, so it runs once they have all arrived. The canvas waits to start drawing until `onDone`. */
export function Warmup({ through = false, onStart, onDone }: { through?: boolean; onStart?: () => void; onDone: () => void }) {
  const { scene } = useThree();
  const compile = useCompile(through);
  useEffect(() => {
    onStart?.();
    let stale = false;
    void compile(scene).then(() => stale || onDone());
    return () => {
      stale = true;
    };
    // once, when the boundary around it resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Things that arrive after the world is already running stay hidden until their shaders are ready, so they can never freeze a moving scene. */
export function Warm({ through = false, onDone, children }: { through?: boolean; onDone?: () => void; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const compile = useCompile(through);
  useEffect(() => {
    let stale = false;
    const g = group.current!;
    void compile(g).then(() => {
      if (stale) return;
      g.visible = true;
      onDone?.();
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <group ref={group} visible={false}>{children}</group>;
}
