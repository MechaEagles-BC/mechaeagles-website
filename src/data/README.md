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

## Rules for content

Only publish what's true and on record. Leave a list empty and the page shows a "Not published yet" state, so there's never a reason to write a placeholder as if it were real. Confirm sponsor relationships with the sponsor before listing them.
