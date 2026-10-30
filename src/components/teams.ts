/** Team order runs clockwise from the front-left coupler, matching the buttons. */
export const TEAMS = [
  { id: "baja", name: "Baja SAE", color: "#f2a33a", angle: (-Math.PI * 3) / 4 },
  { id: "aero", name: "AeroEagles", color: "#6fb7ff", angle: (Math.PI * 3) / 4 },
  { id: "combat", name: "Combat Robotics", color: "#ff3d1f", angle: Math.PI / 4 },
  { id: "ai", name: "AI Safety", color: "#9b8cff", angle: -Math.PI / 4 },
];

export type Fx = { hover: number; held: number; pulse: number; pulseT: number; rippleT: number; boost: number };
