/** Where the road runs, and how a kit prop gets stood on the ground at a chosen height. Shared by the monuments and the land around them. */
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const URL = "/legacy/props.glb";
export const SPACING = 24;
export type World = "valley" | "space";
export type Piece = { prop: string; at: [number, number]; height: number; yaw?: number };

/** A point on the road. Whole numbers are monuments, oldest first. Halfway points are the gates between years. */
export const spot = (i: number, count: number) => new THREE.Vector3(Math.sin(i * 1.35) * 2.6, 0, (i - (count - 1)) * SPACING);

/** The road's direction at a point, as a turn about the vertical. */
export const heading = (i: number, count: number) => {
  const a = spot(i - 0.02, count);
  const b = spot(i + 0.02, count);
  return Math.atan2(b.x - a.x, b.z - a.z);
};

export function seeded(start: number) {
  let seed = start;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** A clone of one kit prop, stood on the ground at a chosen height, whatever the kit's own scale was. */
export function useProp(name: string, height: number) {
  const { scene } = useGLTF(URL, false, true);
  return useMemo(() => {
    const source = scene.getObjectByName(`P_${name}`);
    if (!source) return new THREE.Group();
    const copy = source.clone(true);
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.set(1, 1, 1);
    copy.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    const scale = height / Math.max(size.y, 0.001);
    const centre = box.getCenter(new THREE.Vector3());
    copy.scale.setScalar(scale);
    copy.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
    const holder = new THREE.Group();
    holder.add(copy);
    return holder;
  }, [scene, name, height]);
}

export function Prop({ piece }: { piece: Piece }) {
  const object = useProp(piece.prop, piece.height);
  return <primitive object={object} position={[piece.at[0], 0, piece.at[1]]} rotation={[0, piece.yaw ?? 0, 0]} />;
}
