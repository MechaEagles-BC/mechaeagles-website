/**
 * Cuts a line drawing into stone. The drawing's edges are drawn flat, widened into a V-shaped groove, and turned into the two maps a stone surface needs:
 * a normal map, so sunlight catches one side of each cut and the other falls into shadow, and an occlusion map, so the groove floor darkens and moss settles in it.
 * Drawn once on the graphics card, then only read.
 */
import * as THREE from "three";

const SIZE = 512;
const GROOVE = 4.4; // the groove's half-width in texels

const FULL = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

function pass(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  const material = new THREE.ShaderMaterial({ vertexShader: FULL, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  gl.setRenderTarget(target);
  gl.render(quad, new THREE.Camera());
  quad.geometry.dispose();
  material.dispose();
}

/** `drawing` is the line drawing, in the panel's frame. It's centred and scaled to fill most of a `width` by `height` panel, whatever its own size or shape. */
export function carveMaps(gl: THREE.WebGLRenderer, drawing: THREE.Object3D, width: number, height: number) {
  const make = (h: number) => new THREE.WebGLRenderTarget(SIZE, h, { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false });
  const tall = Math.round((SIZE * height) / width);
  const lines = make(tall);
  const solid = make(tall);
  const depth = make(tall);
  const normal = make(tall);
  const ao = make(tall);
  const glow = make(tall);
  const previous = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();

  // 1. the drawing, seen straight on, white lines on black, framed so it sits in the middle of the slab and fills about three quarters of it
  const scene = new THREE.Scene();
  scene.add(drawing);
  scene.updateMatrixWorld(true);
  // Measured from where the lines really are, ignoring the stray fraction of a percent at the edges, so one far-flung point can't shrink the whole carving.
  const xs: number[] = [];
  const ys: number[] = [];
  const v = new THREE.Vector3();
  drawing.traverse((o) => {
    const line = o as THREE.LineSegments;
    const at = line.isLineSegments ? line.geometry.getAttribute("position") : null;
    if (!at) return;
    for (let i = 0; i < at.count; i++) {
      v.fromBufferAttribute(at, i).applyMatrix4(line.matrixWorld);
      xs.push(v.x);
      ys.push(v.y);
    }
  });
  const range = (list: number[]) => {
    const sorted = [...list].sort((p, q) => p - q);
    return [sorted[Math.floor(sorted.length * 0.004)], sorted[Math.ceil(sorted.length * 0.996) - 1]];
  };
  const [x0, x1] = range(xs);
  const [y0, y1] = range(ys);
  const middle = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const size = new THREE.Vector3(x1 - x0, y1 - y0, 0);
  const fill = 0.78;
  const span = Math.max(size.x / (width * fill), size.y / (height * fill));
  const halfW = (width * span) / 2;
  const halfH = (height * span) / 2;
  const camera = new THREE.OrthographicCamera(middle.x - halfW, middle.x + halfW, middle.y + halfH, middle.y - halfH, -50, 50);
  camera.position.set(0, 0, 10);
  gl.setClearColor(0x000000, 1);
  // Its sharp edges, then its whole shape: a smooth body like a rocket's has no edges, so its outline is cut from the shape.
  const show = (lines: boolean) => drawing.traverse((o) => {
    if ((o as THREE.LineSegments).isLineSegments) o.visible = lines;
    else if ((o as THREE.Mesh).isMesh) o.visible = !lines;
  });
  show(true);
  gl.setRenderTarget(lines);
  gl.clear();
  gl.render(scene, camera);
  show(false);
  gl.setRenderTarget(solid);
  gl.clear();
  gl.render(scene, camera);
  show(true);
  scene.remove(drawing);

  const texel = { value: new THREE.Vector2(1 / SIZE, 1 / tall) };
  // 2. the groove: each line widened into a V, deepest at the line
  pass(gl, depth, `varying vec2 vUv; uniform sampler2D uLines, uSolid; uniform vec2 uTexel;
    float line(vec2 uv){
      float inside = texture2D(uSolid, uv).r;
      float out_ = min(min(texture2D(uSolid, uv + vec2(uTexel.x, 0.0)).r, texture2D(uSolid, uv - vec2(uTexel.x, 0.0)).r), min(texture2D(uSolid, uv + vec2(0.0, uTexel.y)).r, texture2D(uSolid, uv - vec2(0.0, uTexel.y)).r));
      return max(texture2D(uLines, uv).r, step(0.5, inside) * step(out_, 0.5));
    }
    void main(){
      float d = 0.0;
      for (int y = -5; y <= 5; y++) for (int x = -5; x <= 5; x++) {
        vec2 o = vec2(float(x), float(y));
        float r = length(o);
        if (r > ${GROOVE.toFixed(1)} + 0.5) continue;
        d = max(d, line(vUv + o * uTexel) * (1.0 - r / (${GROOVE.toFixed(1)} + 0.5)));
      }
      gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
    }`, { uLines: { value: lines.texture }, uSolid: { value: solid.texture }, uTexel: texel });
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
  // 5. where light pools in the cut, for the runestone glow: strongest at the floor of the groove
  pass(gl, glow, `varying vec2 vUv; uniform sampler2D uDepth;
    void main(){ float d = smoothstep(0.25, 0.9, texture2D(uDepth, vUv).r); gl_FragColor = vec4(vec3(d), 1.0); }`, { uDepth: { value: depth.texture } });

  gl.setRenderTarget(previous);
  gl.setClearColor(clear, clearAlpha);
  lines.dispose();
  solid.dispose();
  depth.dispose();
  return {
    normal: normal.texture,
    ao: ao.texture,
    glow: glow.texture,
    dispose: () => {
      normal.dispose();
      ao.dispose();
      glow.dispose();
    },
  };
}
