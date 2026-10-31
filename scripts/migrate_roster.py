"""One-time move from the old roster.json to members.json, the single record for every person. Kept so the decisions it made can be read.
From now on, edit src/data/members.json by hand. See src/data/README.md."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TERM = "2026-27"
old = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
SUBS = {t: [s["name"] for s in old["teams"][t]["subsystems"]] for t in old["teams"]}
ALIAS = {"Structures": "Structure", "CAD": "CAD & integration"}


def subsystem(team, specialties, title=""):
    for name in SUBS[team]:
        if title and name.split(" ")[0].lower() in title.lower():
            return name
    for s in specialties:
        s = ALIAS.get(s, s)
        if s in SUBS[team]:
            return s
    return None


def roles_of(p):
    out = []
    for m in p["memberships"]:
        team, title, lead = m["team"], m.get("title"), m.get("role") == "lead"
        if team == "leadership":
            if title == "Project Manager":
                out.append({"term": TERM, "org": "leadership", "kind": "pm", "title": "Project Manager"})
            elif title == "DPM":
                out.append({"term": TERM, "org": "leadership", "kind": "dpm", "title": "Deputy Project Manager"})
            # "CS Lead" is deliberately not carried over: it is not a position in the organisation.
        elif title == "DPM / Programmatics":
            out.append({"term": TERM, "org": "leadership", "kind": "dpm", "title": "Deputy Project Manager"})
            out.append({"term": TERM, "org": "programmatics", "kind": "group-lead", "title": "Programmatics Lead"})
        elif title and "·" in title:  # "Aero Lead · Payload Lead"
            first, second = [x.strip() for x in title.split("·")]
            out.append({"term": TERM, "org": team, "kind": "team-lead", "title": first})
            out.append({"term": TERM, "org": team, "kind": "subsystem-lead", "subsystem": subsystem(team, p["specialties"], second), "title": second})
        elif lead:
            out.append({"term": TERM, "org": team, "kind": "team-lead", "title": title})
        elif title:
            out.append({"term": TERM, "org": team, "kind": "subsystem-lead", "subsystem": subsystem(team, p["specialties"], title), "title": title})
        else:
            role = {"term": TERM, "org": team, "kind": "member"}
            sub = subsystem(team, p["specialties"])
            if sub:
                role["subsystem"] = sub
            out.append(role)
    return out


members = []
for p in old["people"]:
    members.append({
        "id": p["slug"],
        "name": p["name"],
        "status": "current",
        "consent": p["consent"],
        "photo": p.get("photo"),
        "links": {"linkedin": p["linkedin"]} if p.get("linkedin") else {},
        "bio": p.get("bio"),
        "major": p.get("major"),
        "gradYear": p.get("year"),
        "specialties": p["specialties"],
        "roles": roles_of(p),
        "achievements": p.get("achievements", []),
        "alumni": None,
    })
out = ROOT / "src" / "data" / "members.json"
out.write_text("[\n" + ",\n".join("  " + json.dumps(m, ensure_ascii=False) for m in members) + "\n]\n", encoding="utf8")
print(len(members), "without a role:", [m["id"] for m in members if not m["roles"]])
for m in members:
    if any(r["kind"] != "member" for r in m["roles"]) or len(m["roles"]) > 1:
        print(m["id"], [(r["org"], r["kind"], r.get("subsystem"), r.get("title")) for r in m["roles"]])
