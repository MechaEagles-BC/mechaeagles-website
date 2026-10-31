/**
 * Moving through the years. Works the same with or without the 3D path: the rail, the arrows, the keyboard and a shared link all choose a year, and the story below follows.
 * Listens on the document, so nothing piles up as pages change.
 */
import { canRun3D } from "../capability";
import type { Year } from "./LegacyWorld";

type Data = { years: Year[] };
let unmount: (() => void) | null = null;
let index = 0;
let last = 0;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const stage = () => document.getElementById("legacy-stage");

function show(i: number, updateLink = true) {
  const root = stage();
  if (!root) return;
  const stops = root.querySelectorAll<HTMLElement>("[data-stop]");
  index = Math.max(0, Math.min(stops.length - 1, i));
  stops.forEach((b, n) => {
    if (n === index) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
    b.classList.toggle("passed", n <= index);
  });
  root.style.setProperty("--at", String(index / Math.max(stops.length - 1, 1)));
  root.querySelectorAll<HTMLElement>("[data-plate]").forEach((p, n) => {
    p.classList.toggle("on", n === index);
    p.toggleAttribute("inert", n !== index);
  });
  const term = stops[index].dataset.stop!;
  document.querySelectorAll<HTMLElement>("[data-cohort]").forEach((p) => (p.hidden = p.dataset.cohort !== term));
  const prev = root.querySelector<HTMLButtonElement>("[data-step='-1']");
  const next = root.querySelector<HTMLButtonElement>("[data-step='1']");
  if (prev) prev.disabled = index === 0;
  if (next) next.disabled = index === stops.length - 1;
  root.classList.add("traveling");
  document.dispatchEvent(new CustomEvent("mc:year", { detail: index }));
  if (!root.dataset.live) setTimeout(() => root.classList.remove("traveling"), 500);
  if (updateLink && !location.hash.match(/^#[a-z]/)) history.replaceState(history.state, "", `#${term}`);
  else if (updateLink && location.hash.match(/^#\d/)) history.replaceState(history.state, "", `#${term}`);
}

function enter() {
  unmount?.();
  unmount = null;
  const root = stage();
  if (!root) return;
  const data = JSON.parse(document.getElementById("legacy-data")!.textContent!) as Data;
  const stops = [...root.querySelectorAll<HTMLElement>("[data-stop]")];
  const fromLink = stops.findIndex((s) => `#${s.dataset.stop}` === location.hash);
  last = data.years.length - 1;
  index = fromLink >= 0 ? fromLink : last; // opens on the newest flame, with all of history behind it
  show(index, false);
  root.classList.remove("traveling");
  if (location.hash.startsWith("#alumni")) document.getElementById("alumni")?.scrollIntoView();
  if (!canRun3D()) return;
  const host = root.querySelector<HTMLElement>("[data-world-host]")!;
  void import("./mountLegacy").then((m) => {
    if (stage() !== root) return;
    root.dataset.live = "";
    unmount = m.mountLegacy(
      host,
      data.years,
      index,
      (i) => show(i),
      () => stage()?.classList.remove("traveling"),
      () => stage()?.classList.add("ready"),
      () => {
        delete root.dataset.live;
        root.classList.remove("ready");
        unmount?.();
        unmount = null;
      },
    );
  });
}

export function startLegacy() {
  document.addEventListener("mc:page", enter);
  document.addEventListener("astro:before-swap", () => {
    unmount?.();
    unmount = null;
  });
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    const stop = t.closest?.<HTMLElement>("[data-stop]");
    const step = t.closest?.<HTMLElement>("[data-step]");
    if (stop) show([...stop.parentElement!.parentElement!.querySelectorAll("[data-stop]")].indexOf(stop));
    else if (step) show(index + Number(step.dataset.step));
    else if (t.closest?.("[data-read-story]")) document.getElementById("year-story")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
  });
  document.addEventListener("keydown", (e) => {
    if (!stage() || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if ((e.target as Element).closest?.("input, textarea, select, dialog, video")) return;
    const r = stage()!.getBoundingClientRect();
    if (r.bottom < 80) return;
    e.preventDefault();
    show(index + (e.key === "ArrowLeft" ? -1 : 1));
  });
}
