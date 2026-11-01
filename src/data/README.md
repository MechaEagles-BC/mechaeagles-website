# Updating the site

Everything about people, teams and history lives in this folder. Components read from here, so you should almost never edit a page to change who or what is on it. After any change, run `npm run build`: a mistake in a file shows up there.

## The files

| File | What it holds |
|---|---|
| `site.json` | The current academic year, contact details, the navigation |
| `members.json` | One record per person, ever. Past and present |
| `teams.json` | Teams, their element, mission, facts and own subsystems |
| `projects.json` | Current builds, by team |
| `gallery.json` | Photos and drawings, by team |
| `videos.json` | Videos, by team |
| `documents.json` | PDFs and reports, by team |
| `milestones.json` | Progress, by team. `"team": "org"` goes on the About page |
| `cohorts.json` | One entry per academic year for the Legacy yard |
| `sponsors.json` | Partners, sponsorship levels and ways to help |

Images go in `public/media/<team>/`, portraits in `public/people/`, logos in `public/partners/`.

## A person

There's one record per person, however many things they do. Add a role rather than a second person.

```json
{
  "id": "first-last", "name": "First Last", "status": "current", "consent": "photo", "photo": "/people/first-last.webp",
  "links": { "linkedin": "https://..." }, "bio": null, "major": null, "gradYear": null, "specialties": ["Avionics"],
  "roles": [
    { "term": "2026-27", "org": "aero", "kind": "subsystem-lead", "subsystem": "Avionics", "title": "Avionics Lead" },
    { "term": "2026-27", "org": "ai-safety", "kind": "member" }
  ],
  "achievements": [], "alumni": null
}
```

- **`kind`** sets where they sit in the chart: `pm`, `dpm`, `team-lead`, `group-lead`, `subsystem-lead` or `member`.
- **`org`** is a team `id` from `teams.json`, or `leadership` for project managers and deputies.
- **`subsystem`** must match a subsystem name in that team's entry in `teams.json`. Teams can have completely different subsystems, or none.
- **`title`** is what shows on the card. Leave it out for a member and the card shows their subsystem.
- **`consent`** is `roster` (name only, no portrait or links), `photo` or `profile`. Set it only to what the person has agreed to. On `roster`, keep `photo` and `links` empty.

Their highest role decides where their one full card goes in the chart. Everywhere else, they show as a short reference to it.

## Each new academic year

1. In `site.json`, change `currentTerm`, for example to `"2027-28"`.
2. In `members.json`, **add** new roles with the new `term`. Don't edit or delete old ones: they're the history, and last year's cohort is built from them.
3. For people who graduated, set `"status": "alumni"`. Their roles stay.
4. In `cohorts.json`, add the new year, and fill in what the finished year achieved.
5. Add new members, portraits and any new subsystems.

## Alumni

An alumni profile appears only when its record says `"published": true`, so nothing goes public until the person has agreed. Everything except the year is optional.

```json
"status": "alumni",
"alumni": { "graduated": 2027, "published": true, "company": "...", "title": "...", "field": "...", "contributions": ["..."] }
```

## The Legacy page

Each year in `cohorts.json` gets a flame, a monument and a story, with no code to change:

- **`epitaph`** and **`story`** are the year's words. **`teamIds`** are its teams: each engineering team also gets a banner in its colour at the monument.
- **`monument`** is what stands around the flame: `prop` is a name from `PROPS` in `unreal/prep_legacy.py`, `at` is `[x, z]` in metres from the flame, `height` is in metres. Keep props within about 3 metres.
- Milestones, photos and videos join a year through their `"term"` field. Rosters, leadership and graduating classes are worked out from `members.json`.
- A class belongs to the year it finished: the class of 2027 appears in 2026-27.

The props come from Quaternius' Fantasy Props MegaKit, CC0 licence. To use a different prop, add it to `PROPS` and rerun that script. The free kit has no buildings, so the road, gates, doors, village and castle are drawn in `src/components/legacy/LegacyLand.tsx`. They need no changes for a new year: another flame simply adds more road and another gate.

An alumni card can also carry a career journey: `"journey": [{ "when": "2027", "title": "...", "org": "..." }]`.

## Photos

Put new photos in `public/media/` or `public/people/` as usual and refer to them by that path. `npm run build` runs `scripts/images.mjs`, which makes the smaller copies in `public/img/` and the blurred previews in `images.json`, for new or changed photos only. Commit those files with the photo. Run `npm run images` to make them without a full build. Never edit `images.json` or `public/img/` by hand.

A copy's name includes a hash of its photo, so replacing a photo gives it a new address and nobody sees the old one. Pictures shown when a link is shared and the browser icons come from `scripts/share-images.mjs`, which is run by hand if the logo or those photos change.

## Music

Each world's track is listed in `music.json` and lives in `public/audio/`. To change a track, replace the file or its `src`, and adjust `gain` if it's louder or softer than the other. Set `cleared` to `true` only once the rights are confirmed.

## Rules for content

Only publish what's true and on record. Leave a list empty and the page shows a "Not published yet" state, so there's never a reason to write a placeholder as if it were real. Confirm sponsor relationships with the sponsor before listing them.
