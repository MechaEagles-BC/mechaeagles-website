/**
 * The Gasson Hall hologram. A hidden depth pass stops overlapping CAD parts and far faces from showing through,
 * so what reads is crisp near-side edges over very faint faces. Everything clips to a height that rises on load.
 * Geometry is a first-pass model from photographs; see gasson/ for what is measured and what is assumed.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ADDITIVE, GLASS } from "./additive";
import { usePartGeometry, type SharedLight } from "./Scene";
import type { Fx } from "./teams";

const SCALE = 0.068; // keeps the whole footprint, about 36 m from centre to corner, inside the 2.47 m collar
const SURFACE_Y = 0.505;
const BUILDING_Y_CENTRE = 9.5; // middle of the footprint, in model metres
const HEIGHT = 61 * SCALE;
const RISE_SECONDS = 3.6;

const holo = {
  uRise: { value: 0 },
  uBoost: { value: 0 },
  uColor: { value: new THREE.Color("#8fc3f7") },
};

const VERT = /* glsl */ `
  varying vec3 vWorld; varying vec3 vN; varying vec3 vView; varying float vH;
  void main(){
    vH = position.y * ${SCALE.toFixed(4)} / ${HEIGHT.toFixed(4)};
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const COMMON = /* glsl */ `
  uniform float uRise, uBoost, uTime, uWaveAmp; uniform vec3 uColor, uAccent;
  vec3 tint(){ return mix(uColor, uAccent, clamp(uBoost * 1.6, 0.0, 0.85)); }
  float gauss(float x){ return exp(-x * x); }
  float sweep(float h){ return gauss((h - fract(uTime * 0.09)) / 0.035); }
  float front(float h){ return gauss((h - uRise) / 0.025) * step(uRise, 0.999); }
`;

function faceMaterial(gain: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uRise: holo.uRise, uBoost: holo.uBoost, uColor: holo.uColor, uGain: { value: gain } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vView; varying float vH;
      uniform float uGain; ${COMMON}
      void main(){
        if (vH > uRise) discard;
        // Degenerate CAD slivers can carry a zero normal. A NaN here would spread across the whole frame through bloom.
        float nLen = length(vN);
        float facing = nLen > 1e-4 ? abs(dot(vN / nLen, normalize(vView))) : 1.0;
        float fres = pow(clamp(1.0 - facing, 0.0, 1.0), 2.2);
        float lines = smoothstep(0.34, 0.5, abs(fract(vWorld.y * 26.0 - uTime * 0.25) - 0.5)) * 0.35;
        float up = mix(1.0, 0.72, vH);
        float i = (0.018 + fres * 0.13 + lines * 0.055) * up + sweep(vH) * 0.1 + front(vH) * 0.55;
        // Dark glass: over a bright valley, added light alone would burn to white.
        vec3 glass = vec3(0.012, 0.03, 0.06) * 0.58;
        gl_FragColor = vec4(glass + tint() * i * (1.0 - min(uBoost, 1.0) * 0.3) * uGain, 0.58);
      }`,
    transparent: true,
    ...GLASS,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}

function edgeMaterial(gain: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uRise: holo.uRise, uBoost: holo.uBoost, uColor: holo.uColor, uGain: { value: gain } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vWorld;
      void main(){
        vH = position.y * ${SCALE.toFixed(4)} / ${HEIGHT.toFixed(4)};
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying float vH; varying vec3 vWorld; uniform float uGain; ${COMMON}
      void main(){
        if (vH > uRise) discard;
        float flicker = 0.97 + 0.03 * sin(uTime * 41.0 + vWorld.y * 9.0);
        float i = (0.62 + sweep(vH) * 1.4 + front(vH) * 2.4) * flicker;
        gl_FragColor = vec4(tint() * i * (1.0 - min(uBoost, 1.0) * 0.45) * uGain, 1.0);
      }`,
    transparent: true,
    ...ADDITIVE,
    depthWrite: false,
    toneMapped: false,
  });
}

// Clipped like everything else, or the unrevealed part of the building would blank out whatever is behind it.
const depthOnly = new THREE.ShaderMaterial({
  uniforms: { uRise: holo.uRise },
  vertexShader: `varying float vH; void main(){ vH = position.y * ${SCALE.toFixed(4)} / ${HEIGHT.toFixed(4)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying float vH; uniform float uRise; void main(){ if (vH > uRise) discard; gl_FragColor = vec4(0.0); }`,
  colorWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 2,
});

function withShared(m: THREE.ShaderMaterial, shared: SharedLight) {
  Object.assign(m.uniforms, { uTime: shared.uTime, uAccent: shared.uAccent, uWaveAmp: shared.uWaveAmp });
  return m;
}

function Piece({ name, faceGain, edgeGain, crease, shared }: { name: string; faceGain: number; edgeGain: number; crease: number; shared: SharedLight }) {
  const geometry = usePartGeometry(`../gasson/${name}`);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, crease), [geometry, crease]);
  const face = useMemo(() => withShared(faceMaterial(faceGain), shared), [faceGain, shared]);
  const line = useMemo(() => withShared(edgeMaterial(edgeGain), shared), [edgeGain, shared]);
  return (
    <>
      <mesh geometry={geometry} material={depthOnly} renderOrder={1} />
      <mesh geometry={geometry} material={face} renderOrder={2} />
      <lineSegments geometry={edges} material={line} renderOrder={3} />
    </>
  );
}

function Cone() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uRise: holo.uRise, uBoost: holo.uBoost, uColor: holo.uColor },
        vertexShader: `varying float vH; varying vec3 vN; varying vec3 vView;
          void main(){ vH = uv.y; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vView = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying float vH; varying vec3 vN; varying vec3 vView; uniform float uRise, uBoost; uniform vec3 uColor;
          void main(){
            float edge = pow(clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0), 1.6);
            float fall = pow(clamp(1.0 - vH, 0.0, 1.0), 2.6);  // unclamped, a tiny overshoot gives NaN, which bloom spreads across the frame
            float i = edge * fall * 0.075 * smoothstep(0.0, 0.2, uRise) * (1.0 + uBoost * 0.6);
            gl_FragColor = vec4(uColor * i, 1.0);
          }`,
        transparent: true,
        ...ADDITIVE,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  return (
    <mesh position={[0, SURFACE_Y + HEIGHT * 0.5, 0]} renderOrder={0} material={material}>
      <cylinderGeometry args={[2.0, 2.2, HEIGHT, 96, 1, true]} />
    </mesh>
  );
}

export default function Hologram({ fx, shared, onRiseEnd }: { fx: RefObject<Fx>; shared: SharedLight; onRiseEnd?: () => void }) {
  const elapsed = useRef(0); // counted here, because the render clock restarts whenever the stage is paused off screen
  useEffect(() => {
    // the time and accent uniforms are shared with the platform, so ripples and selection colour stay in step
    holo.uRise.value = 0;
    elapsed.current = 0;
  }, []);
  useFrame((_, dt) => {
    elapsed.current += Math.min(dt, 0.1);
    const k = Math.min(1, elapsed.current / RISE_SECONDS);
    holo.uRise.value = k === 1 ? 1.2 : 1 - Math.pow(1 - k, 2.2);
    if (k === 1) onRiseEnd?.();
    const target = fx.current!.held >= 0 ? (fx.current!.rippleT >= 0 ? 1.0 : 0.6) : fx.current!.hover >= 0 ? 0.18 : 0;
    holo.uBoost.value = THREE.MathUtils.damp(holo.uBoost.value, target, 5, Math.min(dt, 0.05));
    holo.uColor.value.set("#8fc3f7");
  });
  return (
    <group>
      <Cone />
      <group position={[0, SURFACE_Y, BUILDING_Y_CENTRE * SCALE]} scale={SCALE}>
        <Piece name="tower" faceGain={1} edgeGain={1} crease={30} shared={shared} />
        <Piece name="bay" faceGain={1} edgeGain={0.9} crease={30} shared={shared} />
        <Piece name="facade" faceGain={0.85} edgeGain={0.72} crease={30} shared={shared} />
      </group>
    </group>
  );
}
