/**
 * Everything every page shares. The router swaps the page's content but keeps this script running and the world behind the page alive,
 * so what's here runs once for the whole visit and listens on the document, and nothing piles up as people move around.
 */
import { startSky } from "./sky";
import { canRun3D } from "./capability";
import { startProfile } from "./cards/profile";
import { tiltCards } from "./cards/tilt";
import { startInteractions } from "./interact";
import { startTeamFx } from "./teamFx";

const root = document.documentElement;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let stageStarted = false;

function startStage() {
  if (stageStarted) return;
  const host = document.getElementById("stage-root");
  if (!host) return;
  stageStarted = true;
  void import("./mountStage").then((m) => m.mountStage(host));
}

// Scrolling carries the visitor through the hero: the world pushes in and dissolves as the people rise up out of it.
function follow() {
  const stage = document.getElementById("stage");
  let ticking = false;
  const apply = () => {
    ticking = false;
    const p = root.dataset.page === "home" ? Math.min(scrollY / Math.max(innerHeight, 1), 1.2) : 0;
    stage?.style.setProperty("--p", p.toFixed(4));
    root.classList.toggle("past-hero", root.dataset.page !== "home" || scrollY > innerHeight * 0.4);
    root.classList.toggle("hero-gone", p >= 1.05);
  };
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }, { passive: true });
  addEventListener("resize", apply);
  return apply;
}

function worldSwitch() {
  document.addEventListener("click", (e) => {
    if (!(e.target as Element).closest?.("[data-world-switch]")) return;
    // With the stage running it changes the world itself, because the scene and its picture have to change together.
    if (!document.dispatchEvent(new CustomEvent("mc:world", { cancelable: true }))) return;
    const next = root.dataset.theme === "space" ? "valley" : "space";
    try {
      localStorage.setItem("mc-world", next);
    } catch {
      // private windows can refuse storage; the choice still holds for this page
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const apply = () => void (root.dataset.theme = next);
    root.classList.add("world-change");
    if (doc.startViewTransition && !reduced()) {
      const t = doc.startViewTransition(apply) as { ready: Promise<void>; finished: Promise<void> };
      t.ready.catch(() => undefined);
      t.finished.finally(() => root.classList.remove("world-change")).catch(() => undefined);
    }
    else {
      apply();
      root.classList.remove("world-change");
    }
  });
}

function sheet() {
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    const dialog = document.querySelector<HTMLDialogElement>("#site-sheet");
    if (t.closest?.("[data-sheet-open]")) dialog?.showModal();
    else if (t.closest?.("[data-sheet-close]") || t === dialog || (t.closest?.("#site-sheet a") && dialog)) dialog?.close();
  });
}

function reveal() {
  const items = document.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) return items.forEach((n) => n.classList.add("in"));
  const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    seen.unobserve(e.target);
  }), { rootMargin: "0px 0px -6% 0px" });
  items.forEach((n) => seen.observe(n));
}

// Likely next stops get ready ahead of time. Going Home is the expensive one, so its downloads wait in the browser's cache once this page is idle.
function warmHome() {
  if (root.dataset.page === "home" || stageStarted || !canRun3D()) return;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => void import("./mountStage"));
  // Pointing at a way home starts the scene behind this page, so it's already live on arrival.
  const intent = (e: Event) => {
    if ((e.target as Element).closest?.('a[href="/"]')) startStage();
  };
  document.addEventListener("pointerover", intent, { passive: true });
  document.addEventListener("focusin", intent, { passive: true });
}

let applyScroll = () => undefined as void;
function onPage() {
  if (root.dataset.page === "home") startStage();
  else warmHome();
  reveal();
  tiltCards();
  applyScroll();
  document.dispatchEvent(new CustomEvent("mc:page"));
}

const sky = document.querySelector<HTMLCanvasElement>("#sky");
if (sky) startSky(sky, canRun3D());
applyScroll = follow();
worldSwitch();
sheet();
startProfile();
startInteractions();
startTeamFx();
document.addEventListener("astro:page-load", onPage);
