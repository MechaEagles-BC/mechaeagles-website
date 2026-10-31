/**
 * One team portal: a shared CAD frame, the team's line drawing on a slow turn, and a light that follows hover and selection.
 * The team text is a real link in the page, placed over the nameplate each frame, so it stays sharp and accessible.
 * Only Baldwin-1 is a team model. The other drawings are illustrative, and each caption says what it shows.
 */
import { useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ADDITIVE } from "./additive";
import { Instanced, machined, usePartGeometry, type SharedLight } from "./Scene";
import { captionTransform, PORTAL, TEAMS, type Fx } from "./teams";

const DRAWING_Y = 2.72;
// mirrors cad/portal.py
const SCREW_ZS = [1.3, 1.9, 2.5, 3.1, 3.7];
const SCREW_XS = [-1.65, -1.45, 1.45, 1.65];
const CAPTION_ANCHORS: Record<string, THREE.Vector3> = {
  below: new THREE.Vector3(0, 0, 0.85), // just in front of the plinth
  left: new THREE.Vector3(-2.1, 2.5, 0),
  right: new THREE.Vector3(2.1, 2.5, 0),
};

function drawingMaterials(color: string, shared: SharedLight, level: { value: number }) {
  const uniforms = { uColor: { value: new THREE.Color(color) }, uLevel: level, uTime: shared.uTime };
  const vert = `varying vec3 vWorld; varying vec3 vN; varying vec3 vView;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = mat3(modelMatrix) * NORMAL_EXPR; vView = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const common = { transparent: true, ...ADDITIVE, depthWrite: false, toneMapped: false };
  const face = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert.replace("NORMAL_EXPR", "normal"),
    fragmentShader: `varying vec3 vWorld; varying vec3 vN; varying vec3 vView; uniform vec3 uColor; uniform float uLevel, uTime;
      void main(){
        float nLen = length(vN);
        float facing = nLen > 1e-4 ? abs(dot(vN / nLen, normalize(vView))) : 1.0;
        float fres = pow(clamp(1.0 - facing, 0.0, 1.0), 2.0);
        gl_FragColor = vec4(uColor * (0.02 + fres * 0.34) * (0.7 + uLevel * 0.6), 1.0);
      }`,
    ...common,
  });
  const edge = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vWorld; uniform vec3 uColor; uniform float uLevel, uTime;
      void main(){
        float x = (vWorld.y - fract(uTime * 0.11) * 4.6) / 0.16;
        float sweep = exp(-x * x);
        gl_FragColor = vec4(uColor * (0.5 + uLevel * 0.45 + sweep * 0.5), 1.0);
      }`,
    ...common,
  });
  return { face, edge };
}

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });

export default function Portal({ index, fx, shared, labelRef, screw, screwMaterial, onHover, onSelect }: {
  index: number;
  fx: RefObject<Fx>;
  shared: SharedLight;
  labelRef: RefObject<HTMLAnchorElement | null>;
  screw: THREE.BufferGeometry;
  screwMaterial: THREE.Material;
  onHover: (i: number) => void;
  onSelect: (i: number) => void;
}) {
  const team = TEAMS[index];
  const frame = usePartGeometry("../portal/frame");
  const corner = usePartGeometry(`../portal/${team.drawing}`);
  const ao = useTexture("/models/portal/frame.ao.webp");
  const { camera, size } = useThree();

  const placement = useMemo(() => {
    const x = Math.cos(team.portalAngle) * PORTAL.radius;
    const z = -Math.sin(team.portalAngle) * PORTAL.radius;
    // turned most of the way toward the viewer, so all four panels stay readable
    return { x, z };
  }, []);

  const parts = useMemo(() => {
    ao.flipY = false;
    ao.colorSpace = THREE.NoColorSpace;
    ao.anisotropy = 4;
    ao.needsUpdate = true;
    const level = { value: 0 };
    const accent = new THREE.Color(team.color);
    return {
      level,
      frameMat: machined({ color: "#777b83", roughness: 0.52, metalness: 0.72, blast: 1, wear: 0.5 }, ao),
      drawn: drawingMaterials(team.color, shared, level),
      edges: new THREE.EdgesGeometry(corner, 30),
      lamp: new THREE.MeshBasicMaterial({ color: accent.clone(), toneMapped: false }),
      head: new THREE.BoxGeometry(2.46, 0.03, 0.012),
      side: new THREE.BoxGeometry(0.022, 3.04, 0.012),
      screws: [
        ...SCREW_ZS.flatMap((y) => SCREW_XS.map((x) => [x, y])),
        ...[-1.5, -0.75, 0.75, 1.5].map((x) => [x, 4.565]),
      ].map(([x, y]) =>
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, y > 4 ? 0.2 : 0.18),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
          new THREE.Vector3(0.75, 0.75, 0.75),
        ),
      ),
    };
    // useTexture and the geometries are cached, so these stay stable for the portal's life
  }, []);

  const root = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const anchor = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const f = fx.current!;
    const on = f.lit || f.hover === index || f.held === index;
    const dimmed = !on && (f.hover >= 0 || f.held >= 0);
    // The card rides on the turning platform, and keeps facing the viewer as it goes.
    if (root.current) {
      const c = Math.cos(f.spin);
      const s = Math.sin(f.spin);
      const wx = placement.x * c + placement.z * s;
      const wz = placement.z * c - placement.x * s;
      root.current.rotation.y = Math.atan2(-wx, 25 - wz) * 0.9 - f.spin;
    }
    parts.level.value = THREE.MathUtils.damp(parts.level.value, on ? 1 : dimmed ? -0.35 : 0, 9, dt);
    const k = parts.level.value;
    parts.lamp.color.set(team.color).multiplyScalar(0.72 + k * 0.5);
    if (light.current) light.current.intensity = THREE.MathUtils.damp(light.current.intensity, on ? 9 : dimmed ? 1.2 : 2.6, 7, dt);
    if (turn.current) turn.current.rotation.y = team.drawingYaw + Math.sin(state.clock.elapsedTime * 0.22 + index * 1.7) * 0.2;

    const el = labelRef.current;
    if (el && root.current) {
      root.current.localToWorld(anchor.copy(CAPTION_ANCHORS[team.caption])).project(camera);
      el.style.transform = captionTransform(team.caption, ((anchor.x + 1) / 2) * size.width, ((1 - anchor.y) / 2) * size.height, el, size.width);
    }
  });

  return (
    <group ref={root} position={[placement.x, 0, placement.z]} scale={PORTAL.scale}>
      <mesh geometry={frame} material={parts.frameMat} castShadow receiveShadow />
      <Instanced geometry={screw} material={screwMaterial} matrices={parts.screws} receive={false} />
      <mesh geometry={parts.head} material={parts.lamp} position={[0, 4.465, 0.21]} />
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} geometry={parts.side} material={parts.lamp} position={[x, 2.675, 0.2]} />
      ))}
      <pointLight ref={light} position={[0, 2.7, 2.4]} color={team.color} intensity={2.6} distance={7} decay={1.7} />

      <group position={[0, DRAWING_Y, 0.5]} scale={team.drawingScale} rotation={[0, 0, team.drawingLean]}>
        <group ref={turn}>
          <mesh geometry={corner} material={depthOnly} renderOrder={1} />
          <mesh geometry={corner} material={parts.drawn.face} renderOrder={2} />
          <lineSegments geometry={parts.edges} material={parts.drawn.edge} renderOrder={3} />
        </group>
      </group>

      <mesh
        position={[0, 2.35, 0]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(index);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(-1);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
      >
        <boxGeometry args={[3.9, 4.7, 0.9]} />
      </mesh>
    </group>
  );
}
