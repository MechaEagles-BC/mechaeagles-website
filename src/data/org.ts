/**
 * Turns the data files into the organisation. Nothing about this year's people lives in a component: every chart, card and profile is worked out here
 * from members.json, so changing someone's role moves them everywhere. See README.md in this folder.
 */
import membersJson from "./members.json";
import teamsJson from "./teams.json";
import siteJson from "./site.json";
import projectsJson from "./projects.json";
import cohortsJson from "./cohorts.json";

export const SITE = siteJson;
export const TERM = siteJson.currentTerm;

export type RoleKind = "pm" | "dpm" | "team-lead" | "group-lead" | "subsystem-lead" | "member";
export type Role = { term: string; org: string; kind: RoleKind; title?: string | null; subsystem?: string | null };
export type Alumni = { graduated: number; company?: string; title?: string; field?: string; contributions?: string[]; journey?: { when: string; title: string; org?: string }[]; published: boolean };
export type Member = {
  id: string; name: string; status: "current" | "alumni"; consent: "roster" | "photo" | "profile"; photo: string | null; links: { linkedin?: string; site?: string };
  bio: string | null; major: string | null; gradYear: number | null; specialties: string[]; roles: Role[]; achievements: string[]; alumni: Alumni | null;
};
export type Team = (typeof teamsJson)[number] & { status?: { text: string; updated: string } };

export const MEMBERS = membersJson as Member[];
export const TEAMS = teamsJson as Team[];
export const TEAM = Object.fromEntries(TEAMS.map((t) => [t.id, t])) as Record<string, Team>;
export const ENGINEERING = TEAMS.filter((t) => t.kind === "engineering");
export const PROGRAMMATICS = TEAM.programmatics;
export const BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));

export const now = (m: Member) => (m.status === "current" ? m.roles.filter((r) => r.term === TERM) : []);
export const CURRENT = MEMBERS.filter((m) => m.status === "current");
const inOrg = (m: Member, org: string) => now(m).filter((r) => r.org === org);
const has = (m: Member, kind: RoleKind) => now(m).some((r) => r.kind === kind);

/** What a role is called on a card. A member without a title is named by what they work on, never by a made-up category. */
export const roleName = (r: Role) => r.title ?? r.subsystem ?? "Member";

// A person's main place decides where their one full card sits in the chart. Every other place refers back to it.
const WEIGHT: Record<RoleKind, number> = { pm: 0, dpm: 1, "team-lead": 2, "group-lead": 3, "subsystem-lead": 4, member: 5 };
export const primaryRole = (m: Member): Role | null => [...now(m)].sort((a, b) => WEIGHT[a.kind] - WEIGHT[b.kind])[0] ?? null;

export const RANK: Record<RoleKind, string> = { pm: "Project Management", dpm: "Deputy PM", "team-lead": "Team Lead", "group-lead": "Group Lead", "subsystem-lead": "Subsystem Lead", member: "Member" };

export type Size = "xl" | "l" | "m" | "s";
export type Card = { member: Member; org: string; role: string; rank: string; size: Size; also: { title: string; org: string; orgId: string; element: string; color: string }[] };

const describe = (r: Role) => ({ title: r.kind === "member" ? `${TEAM[r.org].name} member` : roleName(r), org: TEAM[r.org].name, orgId: r.org, element: TEAM[r.org].element, color: TEAM[r.org].color });

/** One member as a card in one place. The card's main line is their role there, and small marks carry the rest of what they do. */
export function cardOf(member: Member, org: string, size: Size): Card {
  const roles = now(member);
  const here = roles.filter((r) => r.org === org).sort((a, b) => WEIGHT[a.kind] - WEIGHT[b.kind]);
  const main = here[0] ?? primaryRole(member);
  const also = roles.filter((r) => r !== main).map(describe);
  return { member, org: main ? org : "leadership", role: main ? roleName(main) : member.specialties[0] ?? "Member", rank: main ? RANK[main.kind] : "Member", size, also };
}

/** A card for a person in the place their role is highest. Used anywhere the team doesn't matter. */
export const primaryCard = (member: Member, size: Size) => cardOf(member, primaryRole(member)?.org ?? "leadership", size);

export const PMS = CURRENT.filter((m) => has(m, "pm"));
export const DPMS = CURRENT.filter((m) => has(m, "dpm"));
export const LEADERS = [...PMS, ...DPMS];

export type Group = { name: string; detail?: string; leads: Member[]; members: Member[] };
export type Branch = { team: Team; leads: Member[]; groups: Group[]; everyone: Member[]; elsewhere: Member[] };

/** One team, with its own subsystems. A team that lists none simply shows its members, with no invented categories. */
export function branchOf(team: Team): Branch {
  const everyone = CURRENT.filter((m) => inOrg(m, team.id).length);
  const leads = everyone.filter((m) => inOrg(m, team.id).some((r) => r.kind === "team-lead" || r.kind === "group-lead"));
  const groups: Group[] = (team.subsystems ?? []).map((s) => ({ ...s, leads: [], members: [] }));
  const open: Group = { name: "Team members", leads: [], members: [] };
  for (const m of everyone) {
    for (const r of inOrg(m, team.id)) {
      if (r.kind === "team-lead" || r.kind === "group-lead") continue;
      const group = groups.find((g) => g.name === r.subsystem) ?? open;
      (r.kind === "subsystem-lead" ? group.leads : group.members).push(m);
    }
  }
  const placed = new Set([...leads, ...groups.flatMap((g) => [...g.leads, ...g.members]), ...open.leads, ...open.members].map((m) => m.id));
  return { team, leads, groups: [...groups, open].filter((g) => g.leads.length || g.members.length), everyone, elsewhere: everyone.filter((m) => !placed.has(m.id)) };
}

export const BRANCHES = ENGINEERING.map(branchOf);
/** Engineering team leads who aren't already introduced as project leadership. */
export const TEAM_LEADS = BRANCHES.flatMap((b) => b.leads).filter((m, i, all) => !LEADERS.includes(m) && all.indexOf(m) === i);
/** Teams led by someone already introduced above, so the list of leads never looks like it's missing a team. */
export const LED_BY_LEADERSHIP = BRANCHES.flatMap((b) => b.leads.filter((m) => LEADERS.includes(m)).map((m) => ({ team: b.team.name, name: m.name })));
export const PROGRAM_BRANCH = branchOf(PROGRAMMATICS);

/** People on the roster with no current team or position. They stay findable while someone places them. */
export const UNPLACED = CURRENT.filter((m) => !now(m).length);

/** Where each person's one full card sits in the chart. Elsewhere they appear as a short reference to it. */
export const isHome = (m: Member, org: string) => primaryRole(m)?.org === org;

/** One or two plain sentences on what a leader does, built only from their real roles. */
export function introOf(m: Member) {
  const parts = now(m);
  const main = primaryRole(m);
  const others = parts.filter((r) => r !== main);
  if (main?.kind === "team-lead") {
    const also = others.filter((r) => r.kind !== "member").map((r) => (r.subsystem ? `its ${r.subsystem} subsystem` : TEAM[r.org].name));
    return `Leads the ${TEAM[main.org].name} team${also.length ? ` and ${also.join(" and ")}` : ""}.`;
  }
  const first = main?.kind === "pm" ? "Runs MechaEagles across all four teams." : "Helps run MechaEagles across all four teams, as deputy to the project managers.";
  const led = others.filter((r) => r.kind !== "member").map((r) => (r.subsystem ? `${r.subsystem} on ${TEAM[r.org].name}` : TEAM[r.org].name));
  return led.length ? `${first} Also leads ${led.join(" and ")}.` : first;
}

export const RESPONSIBILITIES = (m: Member) => now(m).filter((r) => r.org !== "leadership").map((r) => ({ title: r.kind === "member" ? "Member" : roleName(r), team: TEAM[r.org].name, element: TEAM[r.org].element, color: TEAM[r.org].color }));

export const PEOPLE_COUNT = CURRENT.length;

/** All of a person, for their profile. The same record wherever it's opened from. */
export function profiles() {
  return MEMBERS.map((m) => {
    const place = (r: Role) => ({ title: r.kind === "member" ? "Member" : roleName(r), team: TEAM[r.org].name, href: TEAM[r.org].kind === "engineering" ? `/teams/${r.org}/` : null, element: TEAM[r.org].element, spirit: TEAM[r.org].spirit, color: TEAM[r.org].color, term: r.term });
    const main = primaryRole(m);
    return {
      id: m.id, name: m.name, status: m.status, photo: m.photo, links: m.links, bio: m.bio, major: m.major, gradYear: m.gradYear, specialties: m.specialties, achievements: m.achievements,
      main: main ? place(main) : { title: "Member", team: "MechaEagles", href: null, element: "core", spirit: "The Core", color: TEAM.leadership.color, term: TERM },
      roles: now(m).sort((a, b) => WEIGHT[a.kind] - WEIGHT[b.kind]).map(place),
      history: m.roles.filter((r) => r.term !== TERM || m.status !== "current").map(place),
      projects: projectsJson.filter((p) => (p.members as string[]).includes(m.id)).map((p) => ({ name: p.name, href: `/teams/${p.team}/#projects` })),
      alumni: m.alumni?.published ? m.alumni : null,
    };
  });
}

/** A year's people come from each person's own role history, so a cohort stays right after they graduate or change roles. */
export function cohortRoster(term: string) {
  return MEMBERS.flatMap((m) => {
    const roles = m.roles.filter((r) => r.term === term);
    return roles.length ? [{ member: m, roles }] : [];
  });
}
export const COHORTS = cohortsJson.map((c) => {
  const roster = c.term === TERM ? CURRENT.map((m) => ({ member: m, roles: now(m) })) : cohortRoster(c.term);
  const lead = roster.filter((r) => r.roles.some((x) => x.kind === "pm" || x.kind === "dpm"));
  // A class belongs to the academic year it finished: the class of 2027 is part of 2026-27.
  const graduates = MEMBERS.filter((m) => m.alumni?.published && m.alumni.graduated === Number(c.term.split("-")[0]) + 1);
  return { ...c, teams: c.teamIds.map((id) => TEAM[id].name), current: c.term === TERM, roster, leadership: lead, graduates };
});

export const ALUMNI = MEMBERS.filter((m) => m.status === "alumni" && m.alumni?.published);
