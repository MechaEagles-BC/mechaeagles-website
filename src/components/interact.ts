/**
 * What the inner pages do, listening on the document so nothing piles up as pages change: the organisation chart, member search, the photo viewer, the Legacy yard.
 */
function chart() {
  const within = (e: Event, sel: string) => (e.target as Element).closest?.<HTMLElement>(sel);
  const focus = (branch: HTMLElement | null) => {
    const c = document.querySelector<HTMLElement>("[data-chart]");
    if (!c) return;
    if (!branch) {
      delete c.dataset.focus;
      c.querySelectorAll(".lit").forEach((n) => n.classList.remove("lit"));
      return;
    }
    const id = branch.dataset.branch!;
    c.dataset.focus = branch.dataset.trunk;
    c.style.setProperty("--focus", branch.style.getPropertyValue("--c"));
    c.querySelectorAll<HTMLElement>("[data-branch]").forEach((n) => n.classList.toggle("lit", n.dataset.branch === id));
    // Leaders who also hold a role in this team light up, so the relationship reads at a glance.
    c.querySelectorAll<HTMLElement>(".chart__leaders .mcard").forEach((n) => n.classList.toggle("lit", (n.dataset.roles ?? "").split("|").includes(id)));
  };
  document.addEventListener("pointerover", (e) => focus(within(e, "[data-branch]") ?? null), { passive: true });
  document.addEventListener("focusin", (e) => focus(within(e, "[data-branch]") ?? null), { passive: true });

  document.addEventListener("click", (e) => {
    const open = within(e, "[data-open-branch]");
    if (!open) return;
    const panel = document.getElementById(`panel-${open.dataset.openBranch}`);
    if (!panel) return;
    const opening = !panel.classList.contains("open");
    document.querySelectorAll(".panel.open").forEach((p) => p.classList.remove("open"));
    document.querySelectorAll("[data-open-branch]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (!opening) return;
    panel.classList.add("open");
    open.setAttribute("aria-expanded", "true");
    panel.querySelectorAll(".reveal").forEach((n) => n.classList.add("in"));
    panel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  });
}

// Filters any list marked data-search-list. Each item says what it can be found by in data-find.
function search() {
  document.addEventListener("input", (e) => {
    const input = (e.target as Element).closest?.<HTMLInputElement>("[data-search]");
    if (!input) return;
    const box = document.getElementById(input.dataset.search!);
    if (!box) return;
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    box.querySelectorAll<HTMLElement>("[data-find]").forEach((n) => {
      const on = !q || n.dataset.find!.includes(q);
      n.hidden = !on;
      if (on) shown++;
    });
    const count = document.querySelector(`[data-count="${input.dataset.search}"]`);
    if (count) count.textContent = q ? `${shown} found` : "";
  });
}

function viewer() {
  // The full picture starts downloading the moment someone reaches for it, so it's usually there when the viewer opens.
  const ready = new Set<string>();
  const prepare = (e: Event) => {
    const url = (e.target as Element).closest?.<HTMLElement>("[data-view]")?.dataset.view;
    if (!url || ready.has(url)) return;
    ready.add(url);
    new Image().src = url;
  };
  document.addEventListener("pointerover", prepare, { passive: true });
  document.addEventListener("focusin", prepare, { passive: true });
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    const opener = t.closest?.<HTMLElement>("[data-view]");
    const dialog = document.querySelector<HTMLDialogElement>("#viewer");
    if (!dialog) return;
    if (opener) {
      const img = dialog.querySelector("img")!;
      // The small picture already on screen holds the place until the full one has arrived.
      const small = opener.querySelector("img")?.currentSrc;
      img.removeAttribute("src");
      img.style.background = small ? `url("${small}") center/contain no-repeat` : "";
      img.src = opener.dataset.view!;
      img.alt = opener.dataset.alt ?? "";
      dialog.querySelector("figcaption")!.textContent = opener.dataset.caption ?? "";
      dialog.showModal();
    } else if (t === dialog || t.closest?.("[data-view-close]")) dialog.close();
  });
}

function yard() {
  const pick = (button: HTMLElement) => {
    document.querySelectorAll<HTMLElement>("[data-stone]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    document.querySelectorAll<HTMLElement>("[data-cohort]").forEach((p) => (p.hidden = p.dataset.cohort !== button.dataset.stone));
  };
  document.addEventListener("click", (e) => {
    const stone = (e.target as Element).closest?.<HTMLElement>("[data-stone]");
    if (!stone) return;
    pick(stone);
    document.querySelector(`[data-cohort="${stone.dataset.stone}"]`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  });
}

export function startInteractions() {
  chart();
  search();
  viewer();
  yard();
}
