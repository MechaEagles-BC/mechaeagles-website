/** Everything the Teams page does: card tilt, opening a team's world, the full-window profile, and the world switch. */
import { startSky } from "../sky";
import { tiltCards } from "./tilt";

type Profile = {
  slug: string;
  name: string;
  photo: string | null;
  linkedin: string | null;
  bio: string | null;
  specialties: string[];
  achievements: string[];
  places: { team: string; element: string; spirit: string; color: string; title: string; mission: string }[];
};

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const transition = (update: () => void) => {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || still) {
    update();
    return Promise.resolve();
  }
  return doc.startViewTransition(update).finished;
};

function worlds() {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-branch]");
  const panels = document.querySelectorAll<HTMLElement>("[data-world]");
  const started = [...panels].filter((p) => "startOpen" in p.dataset);
  const showAll = started.length > 1;
  panels.forEach((p) => {
    if (!("startOpen" in p.dataset)) p.hidden = true;
  });
  if (started.length === 1) requestAnimationFrame(() => started[0].scrollIntoView({ block: "start" }));
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      const panel = document.getElementById(`world-${b.dataset.branch}`)!;
      const opening = panel.hidden;
      transition(() => {
        if (!showAll) panels.forEach((p) => (p.hidden = true));
        if (!showAll) buttons.forEach((x) => x.setAttribute("aria-expanded", "false"));
        panel.hidden = !opening;
        b.setAttribute("aria-expanded", String(opening));
      }).then(() => {
        if (opening) panel.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      });
    }),
  );
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
};

function profile() {
  const dialog = document.getElementById("profile") as HTMLDialogElement;
  const body = document.getElementById("profile-body")!;
  const data: Profile[] = JSON.parse(document.getElementById("profile-data")!.textContent!);
  const bySlug = new Map(data.map((p) => [p.slug, p]));
  let from: HTMLElement | null = null;

  const fill = (p: Profile) => {
    const main = p.places.find((x) => x.element !== "core") ?? p.places[0];
    body.replaceChildren();
    dialog.dataset.el = main.element;
    dialog.style.setProperty("--c", main.color);
    const art = document.querySelector<HTMLElement>(`.mcard[data-el="${main.element}"] .fx`);
    if (art) {
      const backdrop = art.cloneNode(true) as HTMLElement;
      backdrop.classList.add("profile__art");
      body.append(backdrop);
    }
    const close = el("button", "profile__close", "Close");
    close.type = "button";
    close.addEventListener("click", shut);
    body.append(close);

    const figure = el("div", "profile__figure");
    if (p.photo) {
      const img = el("img", "profile__photo");
      img.src = p.photo;
      img.alt = `Portrait of ${p.name}`;
      figure.append(img);
    } else {
      figure.append(el("span", "profile__monogram", p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")));
    }
    body.append(figure);

    const text = el("div", "profile__text");
    text.append(el("p", "eyebrow", main.spirit));
    const name = el("h2", "profile__name", p.name);
    name.id = "profile-name";
    text.append(name);
    const places = el("ul", "profile__places");
    p.places.forEach((x) => {
      const li = el("li", "");
      li.style.setProperty("--c", x.color);
      li.append(el("strong", "", x.title), el("span", "", x.team));
      places.append(li);
    });
    text.append(places);

    const section = (title: string, fillIt: (box: HTMLElement) => void) => {
      const box = el("section", "profile__section");
      box.append(el("h3", "", title));
      fillIt(box);
      text.append(box);
    };
    section("About", (box) => box.append(el("p", p.bio ? "" : "profile__empty", p.bio ?? `${p.name.split(" ")[0]} hasn't added a bio yet.`)));
    if (p.specialties.length) section("Technical specialties", (box) => {
      const list = el("ul", "profile__chips");
      p.specialties.forEach((s) => list.append(el("li", "", s)));
      box.append(list);
    });
    section("What the team does", (box) => box.append(el("p", "", main.mission)));
    if (p.achievements.length) section("Achievements", (box) => {
      const list = el("ul", "profile__list");
      p.achievements.forEach((a) => list.append(el("li", "", a)));
      box.append(list);
    });
    section("Projects", (box) => box.append(el("p", "profile__empty", "Projects haven't been added yet.")));
    if (p.linkedin) {
      const link = el("a", "profile__link", "LinkedIn");
      link.href = p.linkedin;
      link.rel = "noopener";
      section("Links", (box) => box.append(link));
    }
    body.append(text);
  };

  // The card's picture travels into place, so the profile reads as the same card opened up.
  function show(slug: string, card: HTMLElement | null) {
    const p = bySlug.get(slug);
    if (!p) return;
    from = card;
    if (card) card.style.viewTransitionName = "profile-card";
    fill(p);
    const figure = body.querySelector<HTMLElement>(".profile__figure")!;
    transition(() => {
      if (card) card.style.viewTransitionName = "";
      figure.style.viewTransitionName = "profile-card";
      dialog.showModal();
      document.documentElement.classList.add("profile-open");
    }).then(() => (figure.style.viewTransitionName = ""));
    history.replaceState(null, "", `#${slug}`);
  }

  function shut() {
    const figure = body.querySelector<HTMLElement>(".profile__figure");
    if (figure) figure.style.viewTransitionName = "profile-card";
    const card = from;
    transition(() => {
      if (figure) figure.style.viewTransitionName = "";
      if (card) card.style.viewTransitionName = "profile-card";
      dialog.close();
      document.documentElement.classList.remove("profile-open");
    }).then(() => {
      if (card) {
        card.style.viewTransitionName = "";
        card.focus({ preventScroll: true });
      }
    });
    history.replaceState(null, "", location.pathname + location.search);
  }

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    shut();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) shut();
  });
  document.querySelectorAll<HTMLAnchorElement>(".mcard").forEach((card) =>
    card.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      show(card.dataset.person!, card);
    }),
  );
  // A shared link opens straight on that person, in whichever team they belong to.
  const wanted = location.hash.slice(1);
  if (bySlug.has(wanted)) {
    const card = document.querySelector<HTMLElement>(`.mcard[data-person="${wanted}"]`);
    show(wanted, card && card.offsetParent ? card : null);
  }
}

function reveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) return items.forEach((n) => n.classList.add("in"));
  const seen = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          seen.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -6% 0px" },
  );
  items.forEach((n) => seen.observe(n));
}

function worldSwitch() {
  document.querySelector("[data-world-switch]")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "space" ? "valley" : "space";
    try {
      localStorage.setItem("mc-world", next);
    } catch {
      // private windows can refuse storage; the choice still holds for this page
    }
    transition(() => {
      document.documentElement.dataset.theme = next;
    });
  });
}

export function startOrgPage() {
  const sky = document.querySelector<HTMLCanvasElement>("#sky");
  if (sky) startSky(sky, !still, false); // the planet belongs with the moon, and would sit behind this page's title
  tiltCards();
  worlds();
  reveal();
  worldSwitch();
  profile();
}
