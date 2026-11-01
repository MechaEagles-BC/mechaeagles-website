/**
 * One profile for each person, opened from anywhere. Every card and name links to /people/#their-id, so the same record opens in place on whatever page they were found,
 * the link can be shared, and the browser's back button closes it.
 */
type Place = { title: string; team: string; href: string | null; element: string; spirit: string; color: string; term: string };
type Profile = {
  id: string; name: string; status: string; photo: string | null; links: { linkedin?: string; site?: string }; bio: string | null; major: string | null; gradYear: number | null;
  specialties: string[]; achievements: string[]; main: Place; roles: Place[]; history: Place[]; projects: { name: string; href: string }[];
  alumni: { graduated: number; company?: string; title?: string; field?: string; contributions?: string[]; journey?: { when: string; title: string; org?: string }[] } | null;
};

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const transition = (update: () => void) => {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || still()) {
    update();
    return Promise.resolve();
  }
  const t = doc.startViewTransition(update) as unknown as { ready: Promise<void>; finished: Promise<void> };
  t.ready.catch(() => undefined); // a transition can be cut short by the next one, which is fine
  return t.finished.catch(() => undefined);
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
};

let data: Promise<Map<string, Profile>> | null = null;
const load = () => (data ??= fetch("/profiles.json").then((r) => r.json() as Promise<Profile[]>).then((list) => new Map(list.map((p) => [p.id, p]))));

function fill(body: HTMLElement, p: Profile, close: () => void) {
  const dialog = body.parentElement as HTMLDialogElement;
  const { main } = p;
  body.replaceChildren();
  dialog.dataset.el = main.element;
  dialog.style.setProperty("--c", main.color);
  const art = document.getElementById(`fx-${main.element}`) as HTMLTemplateElement | null;
  if (art) {
    const backdrop = (art.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
    backdrop.classList.add("profile__art");
    body.append(backdrop);
  }
  const shut = el("button", "profile__close", "Close");
  shut.type = "button";
  shut.addEventListener("click", close);
  body.append(shut);

  const figure = el("div", "profile__figure");
  if (p.photo) {
    const img = el("img", "profile__photo");
    // The card's picture is already downloaded, so it holds the place until the larger one arrives.
    const small = document.querySelector<HTMLImageElement>(`[data-person="${p.id}"] img`)?.currentSrc;
    if (small) img.style.background = `url("${small}") 50% 18%/cover no-repeat`;
    img.src = p.photo;
    img.alt = `Portrait of ${p.name}`;
    figure.append(img);
  } else {
    figure.append(el("span", "profile__monogram", p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")));
  }
  body.append(figure);

  const text = el("div", "profile__text");
  text.append(el("p", "eyebrow", p.status === "alumni" ? `Alumni${p.alumni ? `, class of ${p.alumni.graduated}` : ""}` : main.spirit));
  const name = el("h2", "profile__name", p.name);
  name.id = "profile-name";
  text.append(name);

  const places = el("ul", "profile__places");
  p.roles.forEach((x) => {
    const li = el("li", "");
    li.style.setProperty("--c", x.color);
    li.append(el("strong", "", x.title));
    if (x.href) {
      const a = el("a", "", x.team);
      a.href = x.href;
      a.addEventListener("click", () => dialog.close());
      li.append(a);
    } else li.append(el("span", "", x.team));
    places.append(li);
  });
  if (p.roles.length) text.append(places);

  const section = (title: string, fillIt: (box: HTMLElement) => void) => {
    const box = el("section", "profile__section");
    box.append(el("h3", "", title));
    fillIt(box);
    text.append(box);
  };
  const list = (items: string[]) => {
    const ul = el("ul", "profile__list");
    items.forEach((a) => ul.append(el("li", "", a)));
    return ul;
  };
  const first = p.name.split(" ")[0];
  section("About", (box) => box.append(el("p", p.bio ? "" : "profile__empty", p.bio ?? `${first} hasn't added a bio yet.`)));
  if (p.alumni?.company || p.alumni?.title || p.alumni?.field) section("Now", (box) => box.append(el("p", "", [p.alumni!.title, p.alumni!.company, p.alumni!.field].filter(Boolean).join(", "))));
  if (p.alumni?.journey?.length) section("Career journey", (box) => box.append(list(p.alumni!.journey!.map((j) => `${j.when}: ${[j.title, j.org].filter(Boolean).join(", ")}`))));
  if (p.major || p.gradYear) section("Studies", (box) => box.append(el("p", "", [p.major, p.gradYear && `Class of ${p.gradYear}`].filter(Boolean).join(", "))));
  if (p.specialties.length) section("Technical specialties", (box) => {
    const chips = el("ul", "profile__chips");
    p.specialties.forEach((s) => chips.append(el("li", "", s)));
    box.append(chips);
  });
  section("Projects", (box) => {
    if (!p.projects.length) return box.append(el("p", "profile__empty", "Projects haven't been added yet."));
    const ul = el("ul", "profile__list");
    p.projects.forEach((x) => {
      const li = el("li", "");
      const a = el("a", "", x.name);
      a.href = x.href;
      a.addEventListener("click", () => dialog.close());
      li.append(a);
      ul.append(li);
    });
    box.append(ul);
  });
  if (p.achievements.length) section("Achievements", (box) => box.append(list(p.achievements)));
  if (p.alumni?.contributions?.length) section("Contributions", (box) => box.append(list(p.alumni!.contributions!)));
  if (p.history.length) section("Past positions", (box) => box.append(list(p.history.map((h) => `${h.title}, ${h.team}, ${h.term.replace("-", "–")}`))));
  const links = Object.entries(p.links).filter(([, v]) => v);
  if (links.length) section("Links", (box) => links.forEach(([k, v]) => {
    const a = el("a", "profile__link", k === "linkedin" ? "LinkedIn" : "Website");
    a.href = v as string;
    a.rel = "noopener";
    box.append(a);
  }));
  body.append(text);
}

export function startProfile() {
  let from: HTMLElement | null = null;
  let pushed = false;
  const parts = () => ({ dialog: document.getElementById("profile") as HTMLDialogElement | null, body: document.getElementById("profile-body") });

  const hide = () => {
    const { dialog, body } = parts();
    if (!dialog?.open) return;
    const figure = body?.querySelector<HTMLElement>(".profile__figure");
    const card = from?.isConnected && from.offsetParent ? from : null;
    if (figure) figure.style.viewTransitionName = "profile-card";
    transition(() => {
      if (figure) figure.style.viewTransitionName = "";
      if (card) card.style.viewTransitionName = "profile-card";
      dialog.close();
      document.documentElement.classList.remove("profile-open");
    }).then(() => {
      if (card) card.style.viewTransitionName = "";
      // Back where they were, so keyboard users don't lose their place.
      if (from?.isConnected) from.focus({ preventScroll: true });
    });
  };
  const closeLink = () => {
    if (pushed) history.back();
    else {
      history.replaceState(history.state, "", location.pathname + location.search);
      hide();
    }
    pushed = false;
  };

  // The card's picture travels into place, so the profile reads as the same card opened up.
  const show = async (id: string, card: HTMLElement | null) => {
    const p = (await load()).get(id);
    const { dialog, body } = parts();
    if (!p || !dialog || !body || dialog.open) return;
    from = card;
    fill(body, p, closeLink);
    const figure = body.querySelector<HTMLElement>(".profile__figure")!;
    const shown = card?.isConnected && card.offsetParent ? card : null;
    if (shown) shown.style.viewTransitionName = "profile-card";
    transition(() => {
      if (shown) shown.style.viewTransitionName = "";
      figure.style.viewTransitionName = "profile-card";
      dialog.showModal();
      document.documentElement.classList.add("profile-open");
    }).then(() => (figure.style.viewTransitionName = ""));
  };

  const fromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || !/^[a-z-]+$/.test(id)) return hide();
    void load().then((all) => {
      if (all.has(id)) void show(id, document.querySelector<HTMLElement>(`[data-person="${id}"]`));
    });
  };

  // Caught before the router sees the click, so opening a profile never leaves the page.
  document.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const link = (e.target as Element).closest?.<HTMLAnchorElement>("a[data-person]");
    if (!link) return;
    e.preventDefault();
    from = link;
    pushed = true;
    void show(link.dataset.person!, link);
    // Carries the router's own state along, so this stop in the history still works after the visitor has moved to another page.
    history.pushState(history.state, "", `${location.pathname}${location.search}#${link.dataset.person}`);
  }, true);
  document.addEventListener("cancel", (e) => {
    if ((e.target as Element).id !== "profile") return;
    e.preventDefault();
    closeLink();
  }, true);
  document.addEventListener("click", (e) => {
    if ((e.target as Element).id === "profile") closeLink();
  });
  // Going back from a profile only closes it. Caught before the router, which would otherwise reload the page underneath and lose the visitor's place.
  let pagePath = location.pathname + location.search;
  (window as unknown as { __mcPop: (e: Event) => void }).__mcPop = (e) => {
    const samePage = location.pathname + location.search === pagePath;
    const person = /^#[a-z-]+$/.test(location.hash) && !document.getElementById(location.hash.slice(1));
    if (!samePage || !(parts().dialog?.open || person)) return;
    e.stopImmediatePropagation();
    pushed = false;
    if (location.hash) fromHash();
    else hide();
  };
  document.addEventListener("mc:page", () => {
    pagePath = location.pathname + location.search;
    pushed = false;
    document.documentElement.classList.remove("profile-open");
    fromHash();
    // Fetched quietly so the first profile opens at once.
    if (document.querySelector("[data-person]")) void load();
  });
}
