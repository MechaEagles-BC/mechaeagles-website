/**
 * The four teams. Team order runs clockwise from the front-left coupler, matching the buttons.
 * portalAngle places the panel, wider than its coupler, so the four frame the platform rather than cover it.
 */
const deg = (d: number) => (d * Math.PI) / 180;

export const TEAMS = [
  {
    id: "baja", name: "Baja SAE", color: "#f2a33a", angle: deg(-135), portalAngle: deg(-150), href: "/teams/baja/",
    tagline: "Off-road vehicle engineering", note: "Illustrative, not team CAD",
    caption: "below", drawing: "baja_corner", drawingScale: 2.45, drawingYaw: -0.62, drawingLean: 0,
  },
  {
    id: "aero", name: "AeroEagles", color: "#6fb7ff", angle: deg(135), portalAngle: deg(150), href: "/teams/aero/",
    tagline: "High-power rocketry", note: "Baldwin-1 design model. Fins and nose conceptual",
    caption: "left", drawing: "aero_baldwin", drawingScale: 1.02, drawingYaw: 0, drawingLean: -0.6,
  },
  {
    id: "combat", name: "Combat Robotics", color: "#ff3d1f", angle: deg(45), portalAngle: deg(30), href: "/teams/combat-robotics/",
    tagline: "Arena robots", note: "Illustrative, not a team robot",
    caption: "right", drawing: "combat_robot", drawingScale: 3.7, drawingYaw: -0.7, drawingLean: 0,
  },
  {
    id: "ai", name: "AI Safety", color: "#9b8cff", angle: deg(-45), portalAngle: deg(-30), href: "/teams/ai-safety/",
    tagline: "Research and governance", note: "Abstract diagram, not a product",
    caption: "below", drawing: "ai_lattice", drawingScale: 2.2, drawingYaw: 0, drawingLean: 0,
  },
];

export const PORTAL = { radius: 10.3, scale: 0.8 };

/** Where a caption's reference point sits on it. Front captions hang below their panel; back ones sit outboard, clear of the platform. */
export function captionTransform(side: string, x: number, y: number, el: HTMLElement, viewWidth: number) {
  const margin = 8;
  const w = el.offsetWidth;
  if (side === "left") return `translate(${Math.max(w + margin, x)}px, ${y}px) translate(-100%, -50%)`;
  if (side === "right") return `translate(${Math.min(viewWidth - w - margin, x)}px, ${y}px) translate(0, -50%)`;
  const clamped = Math.min(viewWidth - w / 2 - margin, Math.max(w / 2 + margin, x));
  return `translate(${clamped}px, ${y}px) translate(-50%, 0)`;
}

export type Fx = { hover: number; held: number; pulse: number; pulseT: number; rippleT: number; boost: number };
