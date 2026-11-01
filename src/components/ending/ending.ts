/**
 * The bottom of Home. Its still picture needs nothing, and stays for anyone without live 3D. When the section comes near, capable devices start the living map over it.
 * Nothing downloads before that, it only draws while on screen, and it's released on leaving the page. Listens on the document, so nothing piles up as pages change.
 */
import { canRun3D } from "../capability";

let world: { setActive: (on: boolean) => void; unmount: () => void } | null = null;
let near: IntersectionObserver | null = null;
let seen: IntersectionObserver | null = null;

function stop() {
  near?.disconnect();
  seen?.disconnect();
  near = seen = null;
  world?.unmount();
  world = null;
}

function enter() {
  stop();
  const section = document.querySelector<HTMLElement>("#join.ending");
  const host = section?.querySelector<HTMLElement>("[data-ending-host]");
  if (!section || !host || !canRun3D()) return;
  near = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    near?.disconnect();
    void import("./mountEnding").then((m) => {
      if (!host.isConnected) return;
      world = m.mountEnding(host, () => section.classList.add("live"), () => {
        section.classList.remove("live");
        stop();
      });
      seen = new IntersectionObserver(([v]) => world?.setActive(v.isIntersecting));
      seen.observe(section);
    });
  }, { rootMargin: "900px 0px" });
  near.observe(section);
}

export function startEnding() {
  document.addEventListener("mc:page", enter);
  document.addEventListener("astro:before-swap", stop);
}
