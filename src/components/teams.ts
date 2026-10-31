/**
 * The four teams. Team order runs clockwise from the front-left coupler, matching the buttons.
 * portalAngle places the panel, wider than its coupler, so the four frame the platform rather than cover it.
 */
const deg = (d: number) => (d * Math.PI) / 180;

export const TEAMS = [
  {
    id: "baja", name: "Baja SAE", color: "#7fd66a", angle: deg(-135), portalAngle: deg(-150), href: "/teams/baja/",
    tagline: "Earth · Off-road vehicle engineering", note: "Illustrative, not team CAD",
    caption: "below", drawing: "baja_corner", drawingScale: 2.45, drawingYaw: -0.62, drawingLean: 0,
  },
  {
    id: "aero", name: "AeroEagles", color: "#6fb7ff", angle: deg(135), portalAngle: deg(150), href: "/teams/aero/",
    tagline: "Wind · High-power rocketry", note: "Baldwin-1 design model. Fins and nose conceptual",
    caption: "left", drawing: "aero_baldwin", drawingScale: 1.02, drawingYaw: 0, drawingLean: -0.6,
  },
  {
    id: "combat", name: "Combat Robotics", color: "#ff7a2a", angle: deg(45), portalAngle: deg(30), href: "/teams/combat-robotics/",
    tagline: "Fire · Arena robots", note: "Illustrative, not a team robot",
    caption: "right", drawing: "combat_robot", drawingScale: 3.7, drawingYaw: -0.7, drawingLean: 0,
  },
  {
    id: "ai", name: "AI Safety", color: "#a78bff", angle: deg(-45), portalAngle: deg(-30), href: "/teams/ai-safety/",
    tagline: "Mind · Research and governance", note: "Abstract diagram, not a product",
    caption: "below", drawing: "ai_lattice", drawingScale: 2.2, drawingYaw: 0, drawingLean: 0,
  },
];

export const PORTAL = { radius: 10.3, scale: 0.8 };

/** The boards on the valley's signpost, top to bottom, each pointing its own way. */
export const SIGNS = [
  { label: "Home", href: "/", points: 1 as const, yaw: 0.2, tilt: 0.022 },
  { label: "Teams", href: "/teams/", points: -1 as const, yaw: -0.28, tilt: -0.03 },
  { label: "Projects", href: "/projects/", points: 1 as const, yaw: -0.16, tilt: -0.018 },
  { label: "People", href: "#people", points: -1 as const, yaw: 0.2, tilt: 0.026 },
  { label: "About", href: "/about/", points: 1 as const, yaw: 0.3, tilt: 0.012 },
  { label: "Sponsors", href: "/sponsors/", points: 1 as const, yaw: -0.26, tilt: -0.02 },
];

/**
 * The live scene and the rendered valley share one 4:3 film, so they line up. Windows see a band of it: the width always fits,
 * and a window wider than 16:9 fits to the 16:9 band's height, with the sides fading to the page.
 */
export const FILM = { w: 1600, h: 1200, fov: 48.06, position: [0, 8.4, 25] as const, look: [0, 3.3, 0] as const };
export function filmFit(viewW: number, viewH: number) {
  const scale = Math.min(viewW / FILM.w, viewH / (FILM.w * (9 / 16)));
  const fullW = FILM.w * scale;
  const fullH = FILM.h * scale;
  return { fullW, fullH, offsetX: (fullW - viewW) / 2, offsetY: (fullH - viewH) / 2 };
}

export type World = "valley" | "space";

/**
 * The rendered world for a window's shape. All three share the film's lens and aim, so the film is exactly the middle of each.
 * x and y are their size in films.
 */
export function plateFor(viewW: number, viewH: number, world: World = "valley") {
  const aspect = viewW / viewH;
  if (aspect > 16 / 9) return { src: `/plate/${world}-wide.webp`, x: 1.5, y: 1 };
  if (aspect < 4 / 3) return { src: `/plate/${world}-tall.webp`, x: 1, y: 10 / 3 };
  return { src: `/plate/${world}.webp`, x: 1, y: 1 };
}

/** Where a caption's reference point sits on it. Front captions hang below their panel; back ones sit outboard, clear of the platform. */
export function captionTransform(side: string, x: number, y: number, el: HTMLElement, viewWidth: number) {
  const margin = 8;
  const w = el.offsetWidth;
  if (side === "left") return `translate(${Math.max(w + margin, x)}px, ${y}px) translate(-100%, -50%)`;
  if (side === "right") return `translate(${Math.min(viewWidth - w - margin, x)}px, ${y}px) translate(0, -50%)`;
  const clamped = Math.min(viewWidth - w / 2 - margin, Math.max(w / 2 + margin, x));
  return `translate(${clamped}px, ${y}px) translate(-50%, 0)`;
}

export type Fx = { hover: number; held: number; pulse: number; pulseT: number; rippleT: number; boost: number; spin: number; spinGoal: number; dragging: boolean; dragged: boolean; lit: boolean };
