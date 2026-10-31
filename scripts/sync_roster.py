"""Copies the roster and portraits from site/src/content for this prototype, without changing the site. Consent is respected here:
someone on "roster" consent appears by name only, with no portrait and no links.
Bios, projects and achievements are only ever real ones. ACHIEVEMENTS holds what the site's own launch log records.
Run: uv run --no-project --with pyyaml --with pillow python -I scripts/sync_roster.py"""
import json
from pathlib import Path

import yaml
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT.parent.parent / "OneDrive" / "Desktop" / "MechaEagles" / "site" / "src"
OUT = ROOT / "public" / "people"
OUT.mkdir(exist_ok=True)
LAUNCH = "Flew rockets on AeroEagles' first high-power launch day, 19 Sep 2026"
ACHIEVEMENTS = {
    "jack-tommaney": [LAUNCH, "Earned high-power rocketry Level 1 certification on that launch day"],
    "lucas-dimarco": [LAUNCH],
    "vedarsh-mishra": [LAUNCH],
}

people = []
for path in sorted((SITE / "content" / "people").glob("*.yaml")):
    d = yaml.safe_load(path.read_text(encoding="utf8"))
    slug = path.stem
    consent = d.get("consent", "roster")
    p = {"slug": slug, "name": d["name"], "consent": consent, "memberships": d["memberships"], "specialties": d.get("specialties") or []}
    if consent != "roster":
        if d.get("photo"):
            src = (path.parent / d["photo"]).resolve()
            im = ImageOps.fit(Image.open(src).convert("RGB"), (640, 800), Image.LANCZOS)
            im.save(OUT / f"{slug}.webp", quality=80, method=6)
            p["photo"] = f"/people/{slug}.webp"
        if d.get("linkedin"):
            p["linkedin"] = d["linkedin"]
        for key in ("bio", "major", "year"):
            if d.get(key):
                p[key] = d[key]
    if slug in ACHIEVEMENTS:
        p["achievements"] = ACHIEVEMENTS[slug]
    people.append(p)
teams = yaml.safe_load((SITE / "content" / "teams.yaml").read_text(encoding="utf8"))
teams = {t["id"]: {"name": t["name"], "tagline": t["tagline"], "mission": " ".join(t["mission"].split()), "subsystems": t.get("subsystems") or []} for t in teams}
(ROOT / "src" / "data").mkdir(exist_ok=True)
(ROOT / "src" / "data" / "roster.json").write_text(json.dumps({"people": people, "teams": teams}, ensure_ascii=False, indent=1), encoding="utf8")
print("people", len(people), "with portrait", sum("photo" in p for p in people))
