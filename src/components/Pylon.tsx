/**
 * The signpost's other self, for the space world: a dark metal pylon with light running up and down its circuits, and boards whose traces carry it side to side.
 * The boards are the same shape and in the same place as the wooden ones, so navigation works identically in both worlds.
 */
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ADDITIVE } from "./additive";

const CYAN = new THREE.Color("#6fd2ff");
const time = { value: 0 };
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A board's face: a dark panel, its label, and a separate map of traces for the light to run along. */
export function circuitFace(label: string, direction: 1 | -1, seed: number) {
  const w = 720;
  const h = 164;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const panel = make();
  const traces = make();
  const p = panel.getContext("2d")!;
  const t = traces.getContext("2d")!;
  const rand = seeded(seed * 613 + 11);
  const bg = p.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#141c28");
  bg.addColorStop(0.5, "#0d131c");
  bg.addColorStop(1, "#090d14");
  p.fillStyle = bg;
  p.fillRect(0, 0, w, h);
  t.fillStyle = "#000";
  t.fillRect(0, 0, w, h);
  t.strokeStyle = t.fillStyle = "#fff";
  t.lineCap = "round";
  t.lineJoin = "round";
  // Lines run the length of the board, stepping up or down at 45 degrees, and end in solder pads.
  for (const y of [16, 30, 134, 148]) {
    let x = 18 + rand() * 40;
    let at = y;
    t.lineWidth = 2.4;
    t.beginPath();
    t.moveTo(x, at);
    while (x < w - 90) {
      x += 50 + rand() * 90;
      t.lineTo(x, at);
      if (rand() > 0.55) {
        const step = (y < 80 ? 1 : -1) * (rand() > 0.5 ? 8 : -8);
        x += 8;
        at = Math.max(10, Math.min(h - 10, at + step));
        t.lineTo(x, at);
      }
    }
    t.stroke();
    t.beginPath();
    t.arc(x, at, 4.2, 0, 6.3);
    t.fill();
  }
  const write = (g: CanvasRenderingContext2D, draw: () => void) => {
    g.save();
    if (direction < 0) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    draw();
    g.restore();
  };
  const letter = () => write(p, () => {
    p.font = `800 76px "Archivo Variable", Arial, sans-serif`;
    p.textAlign = "center";
    p.textBaseline = "middle";
    p.shadowColor = "#6fd2ff";
    p.shadowBlur = 16;
    p.fillStyle = "#e9f6ff";
    p.fillText(label.toUpperCase(), direction > 0 ? w * 0.46 : w * 0.54, h / 2 + 3);
  });
  letter();
  const panelTex = new THREE.CanvasTexture(panel);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;
  const traceTex = new THREE.CanvasTexture(traces);
  traceTex.anisotropy = 8;
  document.fonts?.load(`800 76px "Archivo Variable"`).then(() => {
    p.fillStyle = bg;
    p.fillRect(0, 0, w, h);
    letter();
    panelTex.needsUpdate = true;
  });
  return new THREE.ShaderMaterial({
    uniforms: { uPanel: { value: panelTex }, uTrace: { value: traceTex }, uTime: time, uHover: { value: 0 }, uSeed: { value: seed * 1.7 }, uDir: { value: direction }, uCyan: { value: CYAN } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D uPanel, uTrace; uniform float uTime, uHover, uSeed, uDir; uniform vec3 uCyan; varying vec2 vUv;
      void main(){
        vec3 panel = texture2D(uPanel, vUv).rgb;
        float trace = texture2D(uTrace, vUv).r;
        float x = fract(vUv.x * 0.5 - uTime * 0.11 * uDir + uSeed);
        float run = smoothstep(0.84, 1.0, x) * 2.6;
        vec3 c = panel * (1.0 + uHover * 0.5) + uCyan * trace * (0.34 + run + uHover * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
    toneMapped: false,
  });
}

function runner(speed: number, offset: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uCyan: { value: CYAN } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uCyan; varying vec2 vUv;
      void main(){
        float y = fract(vUv.y * 1.6 - uTime * ${speed.toFixed(3)} + ${offset.toFixed(3)});
        float run = smoothstep(0.88, 1.0, y) * 3.0;
        gl_FragColor = vec4(uCyan * (0.3 + run), 1.0);
      }`,
    toneMapped: false,
  });
}

/** The column itself. Lines on its faces carry light upward and back down, like signals passing through. */
export function PylonColumn({ height }: { height: number }) {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2b3038", metalness: 0.85, roughness: 0.42 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1b1f26", metalness: 0.8, roughness: 0.5 }), []);
  const lines = useMemo(() => [runner(0.16, 0), runner(-0.13, 0.4), runner(0.21, 0.7), runner(-0.18, 0.15)], []);
  const beacon = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: time, uCyan: { value: CYAN } },
    vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uTime; uniform vec3 uCyan; void main(){ gl_FragColor = vec4(uCyan * (0.8 + pow(0.5 + 0.5 * sin(uTime * 1.4), 8.0) * 3.0), 1.0); }",
    toneMapped: false,
    ...ADDITIVE,
  }), []);
  useFrame((_, dt) => void (time.value += Math.min(dt, 0.1)));
  return (
    <>
      <mesh position={[0, 0.16, 0]} material={dark} castShadow><cylinderGeometry args={[0.74, 0.92, 0.32, 8]} /></mesh>
      <mesh position={[0, 0.44, 0]} material={metal} castShadow><cylinderGeometry args={[0.46, 0.6, 0.26, 8]} /></mesh>
      <mesh position={[0, height / 2, 0]} material={metal} castShadow><boxGeometry args={[0.34, height, 0.34]} /></mesh>
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={x} position={[x, height / 2 + 0.3, 0.176]} material={lines[i]}><boxGeometry args={[0.022, height - 0.6, 0.004]} /></mesh>
      ))}
      {[-1, 1].map((side, i) => (
        <mesh key={side} position={[side * 0.176, height / 2 + 0.3, 0]} material={lines[i + 2]}><boxGeometry args={[0.004, height - 0.6, 0.022]} /></mesh>
      ))}
      <mesh position={[0, height + 0.05, 0]} material={dark}><boxGeometry args={[0.5, 0.1, 0.5]} /></mesh>
      <mesh position={[0, height + 0.3, 0]} rotation={[0, Math.PI / 4, 0]} material={beacon}><octahedronGeometry args={[0.16, 0]} /></mesh>
    </>
  );
}

export const pylonSide = () => new THREE.MeshStandardMaterial({ color: "#1d222a", metalness: 0.8, roughness: 0.45 });
