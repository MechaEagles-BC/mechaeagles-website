/**
 * The site's soundtrack. It lives in this one module, outside every page, so the router's page changes never touch it and it never restarts.
 * It's off until a visitor turns it on, and nothing downloads before then. Each world keeps its own place in its track, so coming back resumes where it left off.
 */
import music from "../data/music.json";

type World = keyof typeof music;

const KEY = "mc-sound";
const WORLD_FADE = 2.6; // seconds to cross between the two worlds
const LOOP_FADE = 4; // seconds of overlap where a track meets its own start
const SWITCH_FADE = 1.1;
const DEFAULT_VOLUME = 0.5;

const root = document.documentElement;
const worldNow = (): World => (root.dataset.theme === "space" ? "space" : "valley");

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { on: saved.on === true, volume: typeof saved.volume === "number" ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT_VOLUME };
  } catch {
    return { on: false, volume: DEFAULT_VOLUME };
  }
}
const prefs = read();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // private windows can refuse storage; the choice still holds for this visit
  }
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let duck: GainNode | null = null;
const tracks: Partial<Record<World, Track>> = {};
let current: World | null = null;
let failed = false;
let waiting = prefs.on; // wants to play, but the browser needs a click first (after a reload)

function ramp(param: AudioParam, to: number, seconds: number) {
  const now = ctx!.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + Math.max(seconds, 0.01));
}

/** A track is two players, so the end of the track can dissolve into its own beginning instead of cutting. */
class Track {
  bus: GainNode;
  voices: { el: HTMLAudioElement; gain: GainNode }[];
  active = 0;
  crossing = false;
  stopTimer = 0;
  constructor(world: World) {
    this.bus = ctx!.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(duck!);
    this.voices = [0, 1].map((i) => {
      const el = new Audio(music[world].src);
      el.preload = i === 0 ? "auto" : "none";
      el.addEventListener("error", () => {
        failed = true;
        paint();
      });
      const gain = ctx!.createGain();
      gain.gain.value = i === 0 ? 1 : 0;
      ctx!.createMediaElementSource(el).connect(gain);
      gain.connect(this.bus);
      return { el, gain };
    });
  }
  get el() {
    return this.voices[this.active].el;
  }
  async start(fade: number, level: number) {
    window.clearTimeout(this.stopTimer);
    await this.el.play();
    ramp(this.bus.gain, level, fade);
  }
  /** Fades out and pauses, keeping its place. */
  stop(fade: number) {
    ramp(this.bus.gain, 0, fade);
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => this.voices.forEach((v) => v.el.pause()), fade * 1000 + 60);
  }
  tick() {
    const { el } = this;
    if (this.crossing || el.paused || !Number.isFinite(el.duration) || el.duration - el.currentTime > LOOP_FADE) return;
    this.crossing = true;
    const next = 1 - this.active;
    const from = this.voices[this.active];
    const to = this.voices[next];
    to.el.currentTime = 0;
    void to.el.play();
    ramp(to.gain.gain, 1, LOOP_FADE);
    ramp(from.gain.gain, 0, LOOP_FADE);
    this.active = next;
    window.setTimeout(() => {
      from.el.pause();
      from.el.currentTime = 0;
      this.crossing = false;
    }, LOOP_FADE * 1000 + 100);
  }
}

// The slider feels even across its range, because hearing is logarithmic. The top end still stays well below full level.
const level = () => prefs.volume * prefs.volume * 0.7;
const trackLevel = (w: World) => music[w].gain;

function ensureAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  duck = ctx.createGain();
  master.gain.value = level();
  duck.connect(master);
  master.connect(ctx.destination);
  window.setInterval(() => (Object.values(tracks) as Track[]).forEach((t) => t.tick()), 300);
}

function track(world: World) {
  return (tracks[world] ??= new Track(world));
}

async function playWorld(world: World, fade: number) {
  ensureAudio();
  await ctx!.resume();
  const before = current;
  current = world;
  if (before && before !== world) tracks[before]?.stop(fade);
  await track(world).start(fade, trackLevel(world));
  waiting = false;
}

async function begin(fade = SWITCH_FADE) {
  try {
    await playWorld(worldNow(), fade);
  } catch {
    waiting = true; // the browser wants a gesture; the next click anywhere will do
  }
  paint();
}

function end() {
  if (current) tracks[current]?.stop(SWITCH_FADE);
  current = null;
  waiting = false;
  paint();
}

/** Keeps every control on the page in step. The bar is replaced on each page change, so this runs again then. */
function paint() {
  const on = prefs.on && !failed;
  root.classList.toggle("sound-on", on && !waiting);
  const title = failed ? "Music couldn't load" : !prefs.on ? "Turn music on" : waiting ? "Music resumes when you click" : `Now playing: ${music[worldNow()].title}. Turn music off`;
  document.querySelectorAll<HTMLButtonElement>("[data-sound-toggle]").forEach((b) => {
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", title);
    b.title = title;
    b.disabled = failed;
  });
  document.querySelectorAll<HTMLInputElement>("[data-sound-volume]").forEach((s) => {
    s.value = String(Math.round(prefs.volume * 100));
    s.setAttribute("aria-valuetext", `${Math.round(prefs.volume * 100)} percent`);
  });
  document.querySelectorAll<HTMLElement>("[data-sound-now]").forEach((n) => (n.textContent = on ? music[worldNow()].title : "Off"));
}

export function startSoundtrack() {
  document.addEventListener("click", (e) => {
    if (!(e.target as Element).closest?.("[data-sound-toggle]")) return;
    prefs.on = !prefs.on;
    save();
    waiting = false;
    if (prefs.on) void begin();
    else end();
    paint();
  });
  document.addEventListener("input", (e) => {
    const s = (e.target as Element).closest?.<HTMLInputElement>("[data-sound-volume]");
    if (!s) return;
    prefs.volume = Number(s.value) / 100;
    save();
    if (master && ctx) ramp(master.gain, level(), 0.12);
    if (prefs.volume > 0 && !prefs.on) {
      prefs.on = true;
      save();
      waiting = false;
      void begin();
    }
    paint();
  });

  // Someone who left it on hears it again after a reload, starting from their next click. Browsers require that, and it's politer anyway.
  const firstGesture = (e: Event) => {
    if ((e.target as Element).closest?.("[data-sound-toggle], [data-sound-volume]")) return; // those two speak for themselves
    if (prefs.on && !current) void begin(2);
  };
  document.addEventListener("pointerdown", firstGesture, { passive: true });
  document.addEventListener("keydown", firstGesture);

  // Changing world dissolves one soundtrack into the other.
  new MutationObserver(() => {
    if (!prefs.on || !current || !root.dataset.theme) return;
    const next = worldNow();
    if (next === current) return;
    void playWorld(next, WORLD_FADE).then(paint);
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // Quiet while the tab is out of sight, and while a video on the page has the floor.
  document.addEventListener("visibilitychange", () => {
    if (!prefs.on || !current || !ctx) return;
    if (document.hidden) tracks[current]?.stop(0.5);
    else void tracks[current]?.start(1.2, trackLevel(current));
  });
  document.addEventListener("play", (e) => {
    if ((e.target as Element).tagName === "VIDEO" && ctx && duck) ramp(duck.gain, 0.12, 0.6);
  }, true);
  for (const type of ["pause", "ended"]) {
    document.addEventListener(type, (e) => {
      if ((e.target as Element).tagName === "VIDEO" && ctx && duck) ramp(duck.gain, 1, 1);
    }, true);
  }

  document.addEventListener("astro:after-swap", paint);
  document.addEventListener("mc:page", paint);
  paint();
}
