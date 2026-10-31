/** The tilt and wake of a card, for pages that show cards without the whole organisation. */
export function tiltCards() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll<HTMLElement>(".mcard").forEach((card) => {
    let frame = 0;
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty("--ry", `${(x - 0.5) * 13}deg`);
        card.style.setProperty("--rx", `${(0.5 - y) * 11}deg`);
        card.style.setProperty("--mx", `${x * 100}%`);
        card.style.setProperty("--my", `${y * 100}%`);
      });
    });
    card.addEventListener("pointerenter", () => card.classList.add("awake"));
    card.addEventListener("pointerleave", () => {
      cancelAnimationFrame(frame);
      card.classList.remove("awake");
      card.style.setProperty("--ry", "0deg"); // eased home by the card's own transition
      card.style.setProperty("--rx", "0deg");
    });
  });
}
