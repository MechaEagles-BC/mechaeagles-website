/**
 * The element moving across a team's hero: dust, airflow, sparks or a thinking network. A small 2D canvas with no libraries.
 * It stops when the hero is out of view or the page changes, and draws one still frame for visitors who prefer less motion.
 */
type P = { x: number; y: number; vx: number; vy: number; life: number; size: number };
let stop: (() => void) | null = null;

function run(canvas: HTMLCanvasElement) {
  const el = canvas.dataset.el!;
  const color = canvas.dataset.color!;
  const ctx = canvas.getContext("2d")!;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0, h = 0, dpr = 1;
  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const count = { earth: 46, wind: 26, fire: 54, mind: 26 }[el] ?? 0;
  const spawn = (p: Partial<P> = {}, fresh = false): P => {
    if (el === "earth") return { x: rand(-40, w), y: rand(h * 0.55, h), vx: rand(6, 26), vy: rand(-7, 1), life: fresh ? rand(0, 1) : 0, size: rand(1, 3.4), ...p };
    if (el === "wind") return { x: fresh ? rand(0, w) : -200, y: rand(0, h), vx: rand(50, 130), vy: 0, life: rand(0, 6.28), size: rand(60, 200), ...p };
    if (el === "fire") return { x: rand(0, w), y: fresh ? rand(h * 0.3, h) : h + 6, vx: rand(-12, 16), vy: rand(-110, -34), life: fresh ? rand(0, 1) : 0, size: rand(0.8, 2.2), ...p };
    return { x: rand(0, w), y: rand(0, h), vx: rand(-5, 5), vy: rand(-5, 5), life: rand(0, 6.28), size: rand(1.5, 3), ...p };
  };
  const parts = Array.from({ length: count }, () => spawn({}, true));
  const pulses = el === "mind" ? Array.from({ length: 7 }, () => ({ a: Math.floor(rand(0, count)), b: Math.floor(rand(0, count)), t: rand(0, 1) })) : [];
  let last = performance.now();
  let frame = 0;
  let time = 0;
  const draw = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (el === "earth") {
        p.life += dt / 7;
        if (p.life > 1 || p.x > w + 20) Object.assign(p, spawn());
        ctx.globalAlpha = Math.sin(p.life * Math.PI) * 0.5;
        ctx.fillStyle = "#d6c8a0";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 6.28);
        ctx.fill();
      } else if (el === "wind") {
        if (p.x > w + 220) Object.assign(p, spawn());
        const y = p.y + Math.sin(p.x * 0.006 + p.life) * 16;
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - p.size, p.y + Math.sin((p.x - p.size) * 0.006 + p.life) * 16);
        ctx.quadraticCurveTo(p.x - p.size / 2, p.y + Math.sin((p.x - p.size / 2) * 0.006 + p.life) * 16, p.x, y);
        ctx.stroke();
      } else if (el === "fire") {
        p.life += dt / 2.6;
        p.vx += Math.sin(time * 2 + p.y * 0.02) * 12 * dt;
        if (p.life > 1 || p.y < -10) Object.assign(p, spawn());
        ctx.globalAlpha = (1 - p.life) * 0.9;
        ctx.strokeStyle = p.life < 0.4 ? "#ffd9a0" : color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (el === "mind") {
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
    }
    if (el === "mind") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const d = Math.hypot(parts[i].x - parts[j].x, parts[i].y - parts[j].y);
          if (d > 190) continue;
          ctx.globalAlpha = (1 - d / 190) * 0.32;
          ctx.beginPath();
          ctx.moveTo(parts[i].x, parts[i].y);
          ctx.lineTo(parts[j].x, parts[j].y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = color;
      for (const p of parts) {
        ctx.globalAlpha = 0.5 + Math.sin(time + p.life) * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 6.28);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      for (const q of pulses) {
        q.t += dt * 0.4;
        if (q.t > 1) Object.assign(q, { a: q.b, b: Math.floor(rand(0, count)), t: 0 });
        const a = parts[q.a], b = parts[q.b];
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * q.t, a.y + (b.y - a.y) * q.t, 1.8, 0, 6.28);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    draw(now);
  };
  addEventListener("resize", size);
  let running = false;
  const seen = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running && !still) {
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    } else if (!e.isIntersecting && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
  });
  seen.observe(canvas);
  if (still) draw(last + 16);
  return () => {
    cancelAnimationFrame(frame);
    seen.disconnect();
    removeEventListener("resize", size);
  };
}

export function startTeamFx() {
  document.addEventListener("mc:page", () => {
    stop?.();
    stop = null;
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.team-fx");
    if (canvas) stop = run(canvas);
  });
}
