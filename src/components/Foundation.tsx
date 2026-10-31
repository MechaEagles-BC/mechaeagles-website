/**
 * The homepage stage: the platform, its four team links, the turning control and the in-place menu.
 * The poster and links need no 3D. Scene.tsx downloads only for capable visitors, and everyone else keeps a still image.
 */
import { Component, createRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { captionTransform, filmFit, plateFor, TEAMS, type Fx } from "./teams";

const Scene = lazy(() => import("./Scene"));

// Where each caption sits in the 1920 x 1080 poster, for visitors and moments without live 3D.
const STILL_ANCHORS = [{ x: 278, y: 886 }, { x: 400, y: 558 }, { x: 1520, y: 558 }, { x: 1642, y: 886 }];
const STILL = { w: 1920, h: 1080 };
const ARRIVAL_TURN = 0.5; // starts a little turned and settles, which shows it can move
const DRAG_THRESHOLD = 6;
const OPEN_DELAY = 520; // long enough to see the pulse leave the card

function placeOnStill(el: HTMLElement, side: string, anchor: { x: number; y: number }) {
  const scale = Math.max(innerWidth / STILL.w, innerHeight / STILL.h);
  const x = innerWidth / 2 + (anchor.x - STILL.w / 2) * scale;
  const y = innerHeight / 2 + (anchor.y - STILL.h / 2) * scale;
  el.style.transform = captionTransform(side, x, y, el, innerWidth);
}

function canRun3D() {
  const q = new URLSearchParams(location.search);
  if (q.has("3d")) return true;
  if (q.has("still")) return false;
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (conn?.saveData || /(^|-)2g/.test(conn?.effectiveType ?? "")) return false;
  if (matchMedia("(pointer: coarse)").matches && matchMedia("(max-width: 900px)").matches) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const MENU_LINKS = [
  { label: "People", href: "#people" },
  { label: "Sponsors", href: "/sponsors/" },
  { label: "About", href: "/about/" },
  { label: "Log", href: "/log/" },
  { label: "Join", href: "/join/" },
];

export default function Foundation({ peopleCount, latestLog }: { peopleCount: number; latestLog: { date: string; title: string; href: string } }) {
  const live = useMemo(canRun3D, []);
  const capture = useMemo(() => import.meta.env.DEV && new URLSearchParams(location.search).has("capture"), []);
  const lit = useMemo(() => import.meta.env.DEV && new URLSearchParams(location.search).has("lit"), []);
  const fx = useRef<Fx>({ hover: -1, held: -1, pulse: -1, pulseT: 0, rippleT: -1, boost: 0, spin: capture ? 0 : ARRIVAL_TURN, spinGoal: 0, dragging: false, dragged: false, lit });
  const [held, setHeld] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [ready, setReady] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [active, setActive] = useState(true);
  const [turned, setTurned] = useState(false);
  const [menu, setMenu] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLImageElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const labelRefs = useMemo(() => TEAMS.map(() => createRef<HTMLAnchorElement>()), []);
  const showing3D = live && !gaveUp;
  const shown = hovered >= 0 ? hovered : held;

  const hover = useCallback((i: number) => {
    fx.current.hover = i;
    setHovered(i);
  }, []);
  const select = useCallback((i: number) => {
    const f = fx.current;
    setHeld(i);
    f.held = i;
    if (i >= 0) {
      f.pulse = i;
      f.pulseT = 0;
      f.rippleT = -1;
    }
  }, []);
  // The card answers first, then the page changes.
  const open = useCallback((i: number) => {
    if (fx.current.dragged) return;
    select(i);
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : OPEN_DELAY;
    setTimeout(() => location.assign(TEAMS[i].href), delay);
  }, [select]);
  const onReady = useCallback(() => setReady(true), []);
  const onGiveUp = useCallback(() => setGaveUp(true), []);
  const closeMenu = useCallback(() => {
    setMenu(false);
    hover(-1);
    menuButton.current?.focus();
  }, [hover]);

  // Coming back through the browser's history restores this page as it was left, mid-selection.
  useEffect(() => {
    const onShow = () => select(-1);
    addEventListener("pageshow", onShow);
    return () => removeEventListener("pageshow", onShow);
  }, [select]);

  useEffect(() => {
    const place = () => {
      const fit = filmFit(innerWidth, innerHeight);
      const plate = plateFor(innerWidth, innerHeight);
      const img = plateRef.current;
      if (!img) return;
      if (img.getAttribute("src") !== plate.src) img.src = plate.src;
      const w = fit.fullW * plate.x;
      const h = fit.fullH * plate.y;
      Object.assign(img.style, { width: `${w}px`, height: `${h}px`, left: `${innerWidth / 2 - w / 2}px`, top: `${innerHeight / 2 - h / 2}px` });
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [showing3D]);

  useEffect(() => {
    if (showing3D && ready) return;
    const place = () => labelRefs.forEach((r, i) => r.current && placeOnStill(r.current, TEAMS[i].caption, STILL_ANCHORS[i]));
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [showing3D, ready, labelRefs]);

  // No drawing while the stage is scrolled out of view.
  useEffect(() => {
    if (!stageRef.current) return;
    const seen = new IntersectionObserver(([e]) => setActive(e.isIntersecting));
    seen.observe(stageRef.current);
    return () => seen.disconnect();
  }, []);

  // Turning. Vertical movement stays with the page, so the stage never traps a scroll.
  useEffect(() => {
    if (!showing3D) return;
    const stage = stageRef.current!;
    const f = fx.current;
    let start: { x: number; spin: number } | null = null;
    const down = (e: PointerEvent) => {
      f.dragged = false;
      if (e.button === 0) start = { x: e.clientX, spin: f.spin };
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      if (!f.dragging && Math.abs(dx) < DRAG_THRESHOLD) return;
      f.dragging = f.dragged = true;
      f.spinGoal = start.spin + (dx / stage.clientWidth) * Math.PI * 1.4;
      document.documentElement.classList.add("turning");
      setTurned(true);
    };
    const up = () => {
      start = null;
      f.dragging = false;
      f.spinGoal = 0;
      document.documentElement.classList.remove("turning");
    };
    stage.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      stage.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
  }, [showing3D]);

  useEffect(() => {
    let back = 0;
    const onKey = (e: KeyboardEvent) => {
      if (menu) {
        if (e.key === "Escape") closeMenu();
        if (e.key === "Tab") {
          const items = menuRef.current!.querySelectorAll<HTMLElement>("a, button");
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (!active || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      fx.current.spinGoal = (e.key === "ArrowLeft" ? -1 : 1) * 0.7;
      setTurned(true);
      clearTimeout(back);
      back = window.setTimeout(() => (fx.current.spinGoal = 0), 900);
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      clearTimeout(back);
    };
  }, [menu, active, closeMenu]);

  useEffect(() => {
    document.documentElement.classList.toggle("menu-open", menu);
    if (menu) menuRef.current?.querySelector<HTMLElement>("a")?.focus();
  }, [menu]);

  useEffect(() => {
    document.documentElement.dataset.state = showing3D ? (ready ? "live" : "loading") : "still";
    document.querySelectorAll<HTMLElement>("[data-still-team]").forEach((el) => {
      const on = !showing3D && el.dataset.stillTeam === String(shown);
      if (on) {
        el.querySelectorAll<HTMLSourceElement>("source[data-srcset]").forEach((s) => (s.srcset = s.dataset.srcset!));
        el.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => (img.src = img.dataset.src!));
      }
      el.classList.toggle("on", on);
    });
  }, [showing3D, ready, shown]);

  return (
    <div className="stage__live" ref={stageRef}>
      {showing3D && (
        <div className={`stage__canvas${ready ? " ready" : ""}`} aria-hidden="true">
          <img ref={plateRef} className="stage__plate" alt="" />
          <GLBoundary onError={onGiveUp}>
            <Suspense fallback={null}>
              <Scene fx={fx} labelRefs={labelRefs} active={active} onHover={hover} onSelect={open} onReady={onReady} onGiveUp={onGiveUp} />
            </Suspense>
          </GLBoundary>
        </div>
      )}

      <button ref={menuButton} type="button" className="menu-button" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}>
        Menu
      </button>

      {/* A real link: it can be focused, copied and opened in a new tab, and needs no 3D. */}
      {TEAMS.map((t, i) => (
        <a
          key={t.id}
          ref={labelRefs[i]}
          className="portal-label"
          href={t.href}
          draggable={false}
          style={{ "--c": t.color } as React.CSSProperties}
          aria-current={held === i ? "true" : undefined}
          onPointerEnter={() => hover(i)}
          onPointerLeave={() => hover(-1)}
          onFocus={() => hover(i)}
          onBlur={() => hover(-1)}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            open(i);
          }}
        >
          <span className="portal-label__name">{t.name}</span>
          <span className="portal-label__tag">{t.tagline}</span>
        </a>
      ))}

      {showing3D && <p className={`stage__hint${turned ? " gone" : ""}`} aria-hidden="true">Drag to turn</p>}

      <div ref={menuRef} className={`menu${menu ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" inert={!menu}>
        <button type="button" className="menu-button menu-button--close" onClick={closeMenu}>
          Close
        </button>
        <div className="menu__grid">
          <nav className="menu__main" aria-label="Main">
            <ul className="menu__teams">
              {TEAMS.map((t, i) => (
                <li key={t.id} style={{ "--i": i, "--c": t.color } as React.CSSProperties}>
                  <a href={t.href} onPointerEnter={() => hover(i)} onPointerLeave={() => hover(-1)} onFocus={() => hover(i)} onBlur={() => hover(-1)}>
                    <i aria-hidden="true"></i>
                    <span>{t.name}</span>
                    <small>{t.tagline}</small>
                  </a>
                </li>
              ))}
            </ul>
            <ul className="menu__links">
              {MENU_LINKS.map((l, i) => (
                <li key={l.href} style={{ "--i": i + 4 } as React.CSSProperties}>
                  <a href={l.href} onClick={() => setMenu(false)}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="menu__side" style={{ "--i": 9 } as React.CSSProperties}>
            <dl className="menu__facts">
              <div><dt>People on the roster</dt><dd>{peopleCount}</dd></div>
              <div><dt>Teams</dt><dd>{TEAMS.length}</dd></div>
              <div><dt>Latest log, {latestLog.date}</dt><dd className="menu__log"><a href={latestLog.href}>{latestLog.title}</a></dd></div>
            </dl>
            <a className="menu__contact" href="mailto:mechaeagles@bc.edu">mechaeagles@bc.edu</a>
          </div>
        </div>
      </div>
    </div>
  );
}
