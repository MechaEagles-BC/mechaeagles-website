import * as THREE from "three";

/**
 * Additive light that leaves the canvas alpha alone. THREE.AdditiveBlending also adds alpha, so on a transparent canvas
 * faint light turns into opaque black over the valley behind it.
 */
export const ADDITIVE = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

/** Premultiplied "over", for light that also dims what's behind it, so bright lines hold up against a bright valley. */
export const GLASS = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;
