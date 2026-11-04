/**
 * Cuts a line drawing into stone. The drawing's edges are drawn flat, widened into a V-shaped groove, and turned into the two maps a stone surface needs:
 * a normal map, so sunlight catches one side of each cut and the other falls into shadow, and an occlusion map, so the groove floor darkens and moss settles in it.
 * Drawn once on the graphics card, then only read.
 */
import * as THREE from "three";

const SIZE = 512;
const GROOVE = 3.2; // the groove's half-width in texels

const FULL = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

function pass(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  const material = new THREE.ShaderMaterial({ vertexShader: FULL, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  gl.setRenderTarget(target);
  gl.render(quad, new THREE.Camera());
  quad.geometry.dispose();
  material.dispose();
}

/** `drawing` is the line drawing, placed in the same frame as the panel, which spans `width` by `height` around `centre`. */
export function carveMaps(gl: THREE.WebGLRenderer, drawing: THREE.Object3D, centre: THREE.Vector2, width: number, height: number) {
  const make = (h: number) => new THREE.WebGLRenderTarget(SIZE, h, { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false });
  const tall = Math.round((SIZE * height) / width);
  const lines = make(tall);
  const depth = make(tall);
  const normal = make(tall);
  const ao = make(tall);
  const previous = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();

  // 1. the drawing, seen straight on, white lines on black
  const scene = new THREE.Scene();
  scene.add(drawing);
  const camera = new THREE.OrthographicCamera(centre.x - width / 2, centre.x + width / 2, centre.y + height / 2, centre.y - height / 2, -50, 50);
  camera.position.set(0, 0, 10);
  gl.setClearColor(0x000000, 1);
  gl.setRenderTarget(lines);
  gl.clear();
  gl.render(scene, camera);
  scene.remove(drawing);

  const texel = { value: new THREE.Vector2(1 / SIZE, 1 / tall) };
  // 2. the groove: each line widened into a V, deepest at the line
  pass(gl, depth, `varying vec2 vUv; uniform sampler2D uLines; uniform vec2 uTexel;
    void main(){
      float d = 0.0;
      for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
        vec2 o = vec2(float(x), float(y));
        float r = length(o);
        if (r > ${GROOVE.toFixed(1)} + 0.5) continue;
        d = max(d, texture2D(uLines, vUv + o * uTexel).r * (1.0 - r / (${GROOVE.toFixed(1)} + 0.5)));
      }
      gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
    }`, { uLines: { value: lines.texture }, uTexel: texel });
  // 3. the slopes of the cut, as a normal map
  pass(gl, normal, `varying vec2 vUv; uniform sampler2D uDepth; uniform vec2 uTexel;
    void main(){
      float l = texture2D(uDepth, vUv - vec2(uTexel.x, 0.0)).r, r = texture2D(uDepth, vUv + vec2(uTexel.x, 0.0)).r;
      float b = texture2D(uDepth, vUv - vec2(0.0, uTexel.y)).r, t = texture2D(uDepth, vUv + vec2(0.0, uTexel.y)).r;
      vec3 n = normalize(vec3((r - l) * 2.4, (t - b) * 2.4, 1.0));
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
    }`, { uDepth: { value: depth.texture }, uTexel: texel });
  // 4. how much light reaches the floor of the cut. Red is occlusion; green stays 0, so the stone's wear never outlines the carving.
  pass(gl, ao, `varying vec2 vUv; uniform sampler2D uDepth;
    void main(){ float d = texture2D(uDepth, vUv).r; gl_FragColor = vec4(1.0 - d * 0.8, 0.0, 0.0, 1.0); }`, { uDepth: { value: depth.texture } });

  gl.setRenderTarget(previous);
  gl.setClearColor(clear, clearAlpha);
  lines.dispose();
  depth.dispose();
  return {
    normal: normal.texture,
    ao: ao.texture,
    dispose: () => {
      normal.dispose();
      ao.dispose();
    },
  };
}
