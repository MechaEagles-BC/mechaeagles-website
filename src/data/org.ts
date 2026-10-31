/**
 * Turns the roster into the organisation: who sits where in the chain, and which element each team belongs to.
 * Everything is worked out from titles and memberships in the roster, so changing a person's title moves their card.
 */
import roster from "./roster.json";

export type Person = (typeof roster.people)[number] & { photo?: string; linkedin?: string; achievements?: string[]; bio?: string };

export const ELEMENTS: Record<string, { key: string; spirit: string; color: string; line: string }> = {
  baja: { key: "earth", spirit: "Earth Spirit", color: "#7fd66a", line: "Stone, terrain and mechanical strength" },
  aero: { key: "wind", spirit: "Wind Spirit", color: "#6fb7ff", line: "Sky, currents and flight" },
  "combat-robotics": { key: "fire", spirit: "Fire Spirit", color: "#ff7a2a", line: "Molten metal, sparks and the forge" },
  "ai-safety": { key: "mind", spirit: "Mind Spirit", color: "#a78bff", line: "Networks, reasoning and safeguards" },
  programmatics: { key: "core", spirit: "The Core", color: "#d4dae0", line: "The people who keep four teams running" },
  leadership: { key: "core", spirit: "The Core", color: "#d4dae0", line: "Running MechaEagles across all four teams" },
};

export const TEAM_NAMES = Object.fromEntries(Object.entries(roster.teams).map(([id, t]) => [id, t.name]));
const people = roster.people as Person[];
const hasTitle = (p: Person, pattern: RegExp) => p.memberships.some((m) => "title" in m && pattern.test(String((m as { title?: string }).title)));
const titleIn = (p: Person, team: string) => (p.memberships.find((m) => m.team === team) as { title?: string } | undefined)?.title;

export type Card = { person: Person; team: string; rank: string; role: string; size: "xl" | "l" | "m" | "s" };

const card = (person: Person, team: string, rank: string, role: string, size: Card["size"]): Card => ({ person, team, rank, role, size });

export const PROJECT_MANAGERS = people.filter((p) => hasTitle(p, /Project Manager/)).map((p) => card(p, "leadership", "Project Manager", "Project Manager", "xl"));
export const DEPUTIES = people.filter((p) => hasTitle(p, /DPM/)).map((p) => card(p, p.memberships.some((m) => m.team === "leadership") ? "leadership" : "programmatics", "Deputy Project Manager", titleIn(p, "leadership") || titleIn(p, "programmatics") || "DPM", "l"));

const SUB_ALIASES: Record<string, string> = { Structures: "Structure", CAD: "CAD & integration" };
const subsystemFor = (p: Person, team: string, names: string[]) => {
  const title = titleIn(p, team) ?? "";
  const byTitle = names.find((n) => title.toLowerCase().includes(n.split(" ")[0].toLowerCase()));
  if (byTitle) return byTitle;
  for (const s of p.specialties) {
    const n = SUB_ALIASES[s] ?? s;
    if (names.includes(n)) return n;
  }
  return null;
};

export type Group = { name: string; detail?: string; leads: Card[]; engineers: Card[] };
export type Branch = { id: string; name: string; tagline: string; mission: string; element: (typeof ELEMENTS)[string]; leads: Card[]; groups: Group[]; count: number };

export const BRANCHES: Branch[] = ["baja", "aero", "combat-robotics", "ai-safety", "programmatics"].map((id) => {
  const info = roster.teams[id as keyof typeof roster.teams];
  const members = people.filter((p) => p.memberships.some((m) => m.team === id));
  const leads = members
    .filter((p) => p.memberships.find((m) => m.team === id)?.role === "lead")
    .map((p) => card(p, id, id === "programmatics" ? "Group Lead" : "Team Lead", titleIn(p, id) ?? "Lead", "l"));
  if (id === "programmatics") {
    for (const p of people.filter((x) => hasTitle(x, /CS Lead/))) leads.push(card(p, "leadership", "Program Lead", titleIn(p, "leadership") ?? "Lead", "l"));
  }
  const leadIds = new Set(leads.map((c) => c.person.slug));
  const rest = members.filter((p) => !leadIds.has(p.slug));
  // A team with no listed subsystems groups by what its people actually work on.
  const listed = info.subsystems as { name: string; detail: string }[];
  const names = listed.length ? listed.map((s) => s.name) : [...new Set(rest.flatMap((p) => p.specialties))];
  const groups: Group[] = names.map((name) => ({ name, detail: listed.find((s) => s.name === name)?.detail, leads: [], engineers: [] }));
  const open: Group = { name: id === "programmatics" ? "Members" : "Engineers", leads: [], engineers: [] };
  for (const p of rest) {
    const where = subsystemFor(p, id, names);
    const g = groups.find((x) => x.name === where) ?? open;
    const title = titleIn(p, id);
    if (title && /Lead/.test(title)) g.leads.push(card(p, id, "Subsystem Lead", title, "m"));
    else g.engineers.push(card(p, id, id === "programmatics" ? "Member" : "Engineer", p.specialties[0] ?? (id === "programmatics" ? "Programmatics" : "Team member"), "s"));
  }
  const used = [...groups, open].filter((g) => g.leads.length || g.engineers.length);
  // A team lead who also runs a subsystem shows that subsystem as theirs.
  return { id, name: info.name, tagline: info.tagline, mission: info.mission, element: ELEMENTS[id], leads, groups: used, count: members.length };
});

export const PEOPLE_COUNT = people.length;
export const ALL = people;
export const TEAMS_DATA = roster.teams;

/** A card for anyone by their slug, as they appear in their highest role. Used on the homepage. */
export function cardFor(slug: string, size: Card["size"] = "m"): Card {
  const all = [...PROJECT_MANAGERS, ...DEPUTIES, ...BRANCHES.flatMap((b) => [...b.leads, ...b.groups.flatMap((g) => [...g.leads, ...g.engineers])])];
  const found = all.find((c) => c.person.slug === slug)!;
  return { ...found, size };
}

/** Everything the profile view needs, with each person's place in every team they're part of. */
export function profiles() {
  return people.map((p) => ({
    slug: p.slug,
    name: p.name,
    photo: p.photo ?? null,
    linkedin: p.linkedin ?? null,
    bio: p.bio ?? null,
    specialties: p.specialties,
    achievements: p.achievements ?? [],
    places: p.memberships.map((m) => {
      const t = roster.teams[m.team as keyof typeof roster.teams];
      return { team: t.name, element: ELEMENTS[m.team].key, spirit: ELEMENTS[m.team].spirit, color: ELEMENTS[m.team].color, title: (m as { title?: string }).title ?? (m.role === "lead" ? "Lead" : "Member"), mission: t.mission };
    }),
  }));
}
