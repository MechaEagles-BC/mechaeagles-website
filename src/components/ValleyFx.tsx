/**
 * Cloud shadows crossing the valley's meadow. This only changes light and shade: it never moves or warps the picture.
 * A small mask says where the meadow is. It costs one full-window pass, and the plain image stays underneath if WebGL fails.
 */
import { useEffect, useRef, useState } from "react";

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 color;
uniform sampler2D uPlate, uMask; uniform float uTime; uniform vec2 uFilm;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return noise(p) * 0.55 + noise(p * 2.1 + 7.0) * 0.3 + noise(p * 4.3 + 3.0) * 0.15; }

void main(){
  vec2 uv = vUv;
  vec3 mask = texture(uMask, uv).rgb; // green says where the open meadow is
  vec2 film = (uv - 0.5) * uFilm; // so the same spot in the world gets the same cloud in all three plates
  vec3 base = texture(uPlate, uv).rgb;
  // Cloud shadows, wider toward the viewer, as they would be lying on the ground. Light and shade only: no pixel moves.
  float depth = max(0.12, 0.22 - film.y * 0.9);
  vec2 ground = vec2(film.x / depth, 1.0 / depth);
  float shadow = smoothstep(0.5, 0.7, fbm(ground * 0.34 + vec2(-uTime * 0.05, uTime * 0.012)));
  base *= 1.0 - shadow * 0.22 * mask.g;
  color = vec4(base, 1.0);
}`;

export default function ValleyFx({ active, on, plate }: { active: boolean; on: boolean; plate: { src: string; x: number; y: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef(false);
  const [ready, setReady] = useState(false);
  const [wanted, setWanted] = useState(on); // a visitor who stays in space never downloads any of this
  useEffect(() => {
    run.current = active && on;
    if (on) setWanted(true);
  }, [active, on]);

  useEffect(() => {
    if (!wanted) return;
    const el = canvas.current!;
    const gl = el.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(program, "uTime");
    gl.uniform2f(gl.getUniformLocation(program, "uFilm"), plate.x, plate.y);
    gl.uniform1i(gl.getUniformLocation(program, "uPlate"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uMask"), 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    let frame = 0;
    let stopped = false;
    let time = 0;
    let last = performance.now();
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
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!run.current) return;
      time += dt;
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    Promise.all([load(plate.src, 0), load(plate.src.replace(".webp", "-mask.webp"), 1)])
      .then(() => {
        if (stopped) return;
        el.width = Math.min(1600 * plate.x, 2400);
        el.height = Math.round((el.width * el.clientHeight) / el.clientWidth);
        gl.viewport(0, 0, el.width, el.height);
        setReady(true);
        frame = requestAnimationFrame(draw);
      })
      .catch(() => undefined); // no mask or no plate: the plain picture stays
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [wanted, plate.src, plate.x, plate.y]);

  return <canvas ref={canvas} className={`stage__plate stage__plate--fx${on ? " on" : ""}${ready ? " ready" : ""}`} aria-hidden="true" />;
}
