import * as THREE from "three";
import { FILM } from "./teams";

/** A point in the world that shows at a place on the film, given in lens units, at a distance along the lens axis. For dressing the sky over the picture. */
export function filmPoint(u: number, v: number, distance: number) {
  const pos = new THREE.Vector3(...FILM.position);
  const front = new THREE.Vector3(...FILM.look).sub(pos).normalize();
  const right = new THREE.Vector3().crossVectors(front, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, front);
  return pos.add(front.add(right.multiplyScalar(u)).add(up.multiplyScalar(v)).multiplyScalar(distance));
}
