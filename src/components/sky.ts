/**
 * The space world's sky, behind everything on every page: a galaxy and three depths of stars turning very slowly around a far-off point.
 * The moon stays still in front of it. Each layer answers the pointer and the scroll by its own depth, which is what gives the parallax.
 * No three.js, so it costs next to nothing to load. It only runs while the page is in the space world.
 */
import { filmFit, FILM } from "./teams";

const VERT = `#version 300 es
in vec2 aPos; out vec2 vPx;
uniform vec2 uView;
void main(){ vPx = (aPos * 0.5 + 0.5) * uView; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vPx; out vec4 color;
uniform sampler2D uNebula, uPlanet;
uniform vec2 uView, uLook; uniform float uK, uTime, uScroll, uPlanetOn;

const vec2 POLE = vec2(0.15, -1.9);   // the point the whole sky turns around, far below the frame
const float TURN = 0.00105;           // radians a second: about a hundred minutes for a full turn
const vec4 PLANET = vec4(-0.39, 0.178, 0.2392, 0.2392);

vec2 turned(vec2 p, float speed){ float a = uTime * TURN * speed; float c = cos(a), s = sin(a); p -= POLE; return vec2(p.x * c - p.y * s, p.x * s + p.y * c) + POLE; }
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec2 hash2(vec2 p){ return vec2(hash(p), hash(p + 17.3)); }

// One depth of stars: at most one in each cell of a grid, at a random spot, of a random brightness.
vec3 stars(vec2 p, float cells, float size, float keep){
  vec2 q = p * cells;
  vec3 sum = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = floor(q) + vec2(x, y);
    float h = hash(id);
    if (h > keep) continue;
    vec2 at = id + 0.15 + hash2(id + 3.1) * 0.7;
    float d = length(q - at) / (cells * uK);       // distance in screen pixels, so stars stay sharp at any window size
    float bright = pow(hash(id + 7.7), 5.0) * 1.3 + 0.1;
    float twinkle = 0.86 + 0.14 * sin(uTime * (0.25 + h * 0.9) + h * 90.0); // slow, as seen from a place with no air
    float glow = exp(-d * d / (size * size * (0.6 + bright)));
    vec3 tint = h < keep * 0.2 ? vec3(1.0, 0.88, 0.74) : h < keep * 0.45 ? vec3(0.78, 0.9, 1.0) : vec3(1.0);
    sum += tint * glow * bright * twinkle;
  }
  return sum;
}

void main(){
  vec2 film = vec2(vPx.x - uView.x * 0.5, vPx.y - uView.y * 0.5) * uK;
  // The nebula moves least, the near stars most.
  vec2 far = turned(film + uLook * 0.002 + vec2(0.0, uScroll * 0.012), 0.45);
  vec2 uv = vec2((far.x + 0.9) / 1.8, (far.y + 0.8) / 2.3);
  uv = abs(mod(uv + 1.0, 2.0) - 1.0);  // mirrored, so turning never runs off its edge
  vec3 c = texture(uNebula, uv).rgb;
  c += stars(turned(film + uLook * 0.004 + vec2(0.0, uScroll * 0.03), 0.6), 44.0, 0.85, 0.5) * 0.7;
  c += stars(turned(film + uLook * 0.009 + vec2(0.0, uScroll * 0.07), 0.8), 19.0, 1.05, 0.42) * 1.0;
  c += stars(turned(film + uLook * 0.018 + vec2(0.0, uScroll * 0.14), 1.0), 7.0, 1.35, 0.3) * 1.3;
  // The planet is nearer than the stars and doesn't turn with them. It leaves as the moon does, a little slower.
  vec2 pp = (film + uLook * 0.012 - vec2(0.0, uScroll * 0.55) - PLANET.xy) / PLANET.zw * 0.5 + 0.5;
  if (uPlanetOn > 0.5 && pp.x > 0.0 && pp.x < 1.0 && pp.y > 0.0 && pp.y < 1.0) {
    vec4 pl = texture(uPlanet, pp);
    c = c * (1.0 - pl.a) + pl.rgb * pl.a;
  }
  color = vec4(c, 1.0);
}`;

export function startSky(canvas: HTMLCanvasElement, animate: boolean, planet = true) {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" });
  if (!gl) return () => undefined;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => undefined;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const uView = u("uView"), uK = u("uK"), uTime = u("uTime"), uLook = u("uLook"), uScroll = u("uScroll");
  gl.uniform1i(u("uNebula"), 0);
  gl.uniform1i(u("uPlanet"), 1);
  gl.uniform1f(u("uPlanetOn"), planet ? 1 : 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  let stopped = false;
  let frame = 0;
  let time = 180 + Math.random() * 400; // not the same sky on every visit
  let last = performance.now();
  const look = { x: 0, y: 0, gx: 0, gy: 0 };
  let k = 1;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const fit = filmFit(innerWidth, innerHeight);
    const halfWidth = Math.tan((FILM.fov * Math.PI) / 360) * (FILM.w / FILM.h);
    k = (halfWidth * 2) / (fit.fullW * dpr);
    gl.uniform2f(uView, canvas.width, canvas.height);
    gl.uniform1f(uK, k);
    if (!animate) draw(last);
  };
  const onMove = (e: PointerEvent) => {
    look.gx = (e.clientX / innerWidth) * 2 - 1;
    look.gy = 1 - (e.clientY / innerHeight) * 2;
  };
  function draw(now: number) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (animate) time += dt;
    // Eased, so the sky always follows the pointer gently and never jumps.
    const ease = 1 - Math.exp(-dt * 1.6);
    look.x += (look.gx - look.x) * ease;
    look.y += (look.gy - look.y) * ease;
    gl!.uniform1f(uTime, time);
    gl!.uniform2f(uLook, look.x, look.y);
    gl!.uniform1f(uScroll, scrollY / Math.max(innerHeight, 1));
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (document.documentElement.dataset.theme === "space" && !document.hidden) draw(now);
    else last = now;
  };
  const load = (src: string, unit: number) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (stopped) return resolve();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  addEventListener("resize", size);
  if (animate) addEventListener("pointermove", onMove);
  let begun = false;
  // Nothing downloads until someone is actually in space.
  const begin = () => {
    if (begun || document.documentElement.dataset.theme !== "space") return;
    begun = true;
    Promise.all([load("/plate/space-nebula.webp", 0), load("/plate/space-planet.webp", 1)])
      .then(() => {
        if (stopped) return;
        size();
        canvas.classList.add("ready");
        if (animate) frame = requestAnimationFrame(loop);
        else draw(performance.now());
      })
      .catch(() => undefined);
  };
  begin();
  const watcher = new MutationObserver(begin);
  watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    watcher.disconnect();
    removeEventListener("resize", size);
    removeEventListener("pointermove", onMove);
  };
}
