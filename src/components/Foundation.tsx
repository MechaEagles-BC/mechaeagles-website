/**
 * The homepage stage: the platform, its four team links and the turning control. It starts once and stays alive across pages.
 * The poster and links need no 3D. Scene.tsx downloads only for capable visitors, and everyone else keeps a still image.
 */
import { Component, createRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { navigate } from "astro:transitions/client";
import { prefetch } from "astro:prefetch";
import { captionTransform, filmFit, plateFor, SIGNS, TEAMS, type Fx, type World } from "./teams";
import { canRun3D } from "./capability";
import ValleyFx from "./ValleyFx";

const Scene = lazy(() => import("./Scene"));

// Where each caption sits in the 1920 x 1080 poster, for visitors and moments without live 3D.
const STILL_ANCHORS = [{ x: 278, y: 886 }, { x: 400, y: 558 }, { x: 1520, y: 558 }, { x: 1642, y: 886 }];
const STILL = { w: 1920, h: 1080 };
const DRAG_THRESHOLD = 6;
// With the live world, a chosen card sends light down to the middle circle, which fills and rises in the team's colour before the page changes. Without it, there's nothing to wait for.
const OPEN_DELAY = 2750;
const OPEN_DELAY_STILL = 120;

function placeOnStill(el: HTMLElement, side: string, anchor: { x: number; y: number }) {
  const scale = Math.max(innerWidth / STILL.w, innerHeight / STILL.h);
  const x = innerWidth / 2 + (anchor.x - STILL.w / 2) * scale;
  const y = innerHeight / 2 + (anchor.y - STILL.h / 2) * scale;
  el.style.transform = captionTransform(side, x, y, el, innerWidth);
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

const OTHER: Record<World, World> = { valley: "space", space: "valley" };

export default function Foundation() {
  const live = useMemo(canRun3D, []);
  const capture = useMemo(() => import.meta.env.DEV && new URLSearchParams(location.search).has("capture"), []);
  const lit = useMemo(() => import.meta.env.DEV && new URLSearchParams(location.search).has("lit"), []);
  const fx = useRef<Fx>({ hover: -1, held: -1, pulse: -1, pulseT: 0, rippleT: -1, boost: 0, spin: 0, spinGoal: 0, dragging: false, dragged: false, lit });
  const [held, setHeld] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [ready, setReady] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [active, setActive] = useState(true);
  const [turned, setTurned] = useState(false);
  const [world, setWorld] = useState<World>(() => (document.documentElement.dataset.theme === "space" ? "space" : "valley"));
  const [painted, setPainted] = useState(world); // the live scene changes only once its picture is ready, so the two never disagree
  const stageRef = useRef<HTMLDivElement>(null);
  const plates = useRef<Record<World, HTMLImageElement | null>>({ valley: null, space: null });
  const labelRefs = useMemo(() => TEAMS.map(() => createRef<HTMLAnchorElement>()), []);
  const signRefs = useMemo(() => SIGNS.map(() => createRef<HTMLAnchorElement>()), []);
  const signHover = useRef(-1);
  const signPress = useRef(-1);
  const leaving = useRef(false);
  const leaveTimer = useRef(0);
  const [plateSize, setPlateSize] = useState(() => plateFor(innerWidth, innerHeight, "valley"));
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
    if (fx.current.dragged || leaving.current) return;
    leaving.current = true;
    select(i);
    prefetch(TEAMS[i].href, { ignoreSlowConnection: true });
    const live = document.documentElement.dataset.state === "live";
    const go = () => {
      document.documentElement.classList.add("leaving");
      void navigate(TEAMS[i].href);
    };
    leaveTimer.current = window.setTimeout(go, live ? OPEN_DELAY : OPEN_DELAY_STILL);
  }, [select]);
  const onReady = useCallback(() => setReady(true), []);
  const onGiveUp = useCallback(() => setGaveUp(true), []);

  // Coming back to Home finds the stage as it was left, mid-selection.
  useEffect(() => {
    const onShow = () => {
      leaving.current = false;
      document.documentElement.classList.remove("leaving");
      select(-1);
    };
    // Going somewhere else mid-sequence cancels it.
    const onLeave = () => window.clearTimeout(leaveTimer.current);
    document.addEventListener("mc:page", onShow);
    document.addEventListener("astro:before-preparation", onLeave);
    return () => {
      document.removeEventListener("mc:page", onShow);
      document.removeEventListener("astro:before-preparation", onLeave);
    };
  }, [select]);

  const loadPlate = useCallback((w: World) => {
    const img = plates.current[w];
    const plate = plateFor(innerWidth, innerHeight, w);
    if (img && img.getAttribute("src") !== plate.src) img.src = plate.src;
    return img;
  }, []);
  // The worlds dissolve into each other once the new picture is ready, so the change is one clean move.
  const switchWorld = useCallback(() => {
    const next = OTHER[document.documentElement.dataset.theme === "space" ? "space" : "valley"];
    const apply = () => {
      document.documentElement.dataset.theme = next;
      flushSync(() => {
        setWorld(next);
        setPainted(next);
      });
    };
    try {
      localStorage.setItem("mc-world", next);
    } catch {
      // private windows can refuse storage; the choice still holds for this page
    }
    const img = loadPlate(next);
    (img ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => {
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
      document.documentElement.classList.add("world-change");
      const t = doc.startViewTransition(apply) as { ready: Promise<void>; finished: Promise<void> };
      t.ready.catch(() => undefined);
      t.finished.finally(() => document.documentElement.classList.remove("world-change")).catch(() => undefined);
    });
  }, [loadPlate]);
  useEffect(() => {
    const onWorld = (e: Event) => {
      e.preventDefault();
      switchWorld();
    };
    document.addEventListener("mc:world", onWorld);
    return () => document.removeEventListener("mc:world", onWorld);
  }, [switchWorld]);
  useEffect(() => {
    const img = loadPlate(world);
    if (!img) return;
    let stale = false;
    img.decode().catch(() => undefined).then(() => stale || setPainted(world));
    return () => {
      stale = true;
    };
  }, [world, showing3D, loadPlate]);

  const openSign = useCallback((i: number) => {
    if (fx.current.dragged) return;
    signPress.current = i;
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
    setTimeout(() => {
      signPress.current = -1;
      const href = SIGNS[i].href;
      if (href.startsWith("#")) document.querySelector(href)?.scrollIntoView();
      else void navigate(href);
    }, delay);
  }, []);

  useEffect(() => {
    const place = () => {
      const fit = filmFit(innerWidth, innerHeight);
      const valley = plateFor(innerWidth, innerHeight, "valley");
      setPlateSize((now) => (now.src === valley.src ? now : valley));
      const fxCanvas = stageRef.current?.querySelector<HTMLCanvasElement>(".stage__plate--fx");
      if (fxCanvas) Object.assign(fxCanvas.style, { width: `${fit.fullW * valley.x}px`, height: `${fit.fullH * valley.y}px`, left: `${innerWidth / 2 - (fit.fullW * valley.x) / 2}px`, top: `${innerHeight / 2 - (fit.fullH * valley.y) / 2}px` });
      (Object.keys(plates.current) as World[]).forEach((w) => {
        const img = plates.current[w];
        if (!img) return;
        const plate = plateFor(innerWidth, innerHeight, w);
        if (img.hasAttribute("src") && img.getAttribute("src") !== plate.src) img.src = plate.src;
        const pw = fit.fullW * plate.x;
        const ph = fit.fullH * plate.y;
        Object.assign(img.style, { width: `${pw}px`, height: `${ph}px`, left: `${innerWidth / 2 - pw / 2}px`, top: `${innerHeight / 2 - ph / 2}px` });
      });
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

  // No drawing on other pages, or once the visitor has scrolled past the hero. The scene just waits.
  useEffect(() => {
    const root = document.documentElement;
    const check = () => setActive(root.dataset.page === "home" && !root.classList.contains("hero-gone"));
    const watch = new MutationObserver(check);
    watch.observe(root, { attributes: true, attributeFilter: ["data-page", "class"] });
    document.addEventListener("mc:page", check);
    check();
    return () => {
      watch.disconnect();
      document.removeEventListener("mc:page", check);
    };
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
      f.dragging = false; // it stays where it was put, and never springs home
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.("input, textarea, select, dialog")) return;
      if (!active || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      fx.current.spinGoal += (e.key === "ArrowLeft" ? -1 : 1) * 0.35;
      setTurned(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active]);

  useEffect(() => {
    document.documentElement.dataset.state = (window as unknown as { __mcState: string }).__mcState = showing3D ? (ready ? "live" : "loading") : "still";
    document.querySelectorAll<HTMLElement>("[data-still-team]").forEach((el) => {
      const on = !showing3D && el.dataset.stillTeam === String(shown) && el.dataset.world === world;
      if (on) {
        el.querySelectorAll<HTMLSourceElement>("source[data-srcset]").forEach((s) => (s.srcset = s.dataset.srcset!));
        el.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => (img.src = img.dataset.src!));
      }
      el.classList.toggle("on", on);
    });
  }, [showing3D, ready, shown, world]);

  return (
    <div className="stage__live" ref={stageRef}>
      {showing3D && (
        <div className={`stage__canvas${ready ? " ready" : ""}`} aria-hidden="true">
          {(["valley", "space"] as World[]).map((w) => (
            <img key={w} ref={(el) => void (plates.current[w] = el)} className={`stage__plate${painted === w ? " on" : ""}`} alt="" />
          ))}
          <ValleyFx active={active} on={painted === "valley" && !capture} plate={plateSize} />
          <GLBoundary onError={onGiveUp}>
            <Suspense fallback={null}>
              <Scene world={painted} fx={fx} labelRefs={labelRefs} signRefs={signRefs} signHover={signHover} signPress={signPress} active={active || !ready} onHover={hover} onSelect={open} onReady={onReady} onGiveUp={onGiveUp} />
            </Suspense>
          </GLBoundary>
        </div>
      )}

      {/* A real link: it can be focused, copied and opened in a new tab, and needs no 3D. */}
      {TEAMS.map((t, i) => (
        <a
          key={t.id}
          ref={labelRefs[i]}
          className={`portal-label${shown === i ? " shown" : ""}`}
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
          {/* Letter by letter on screen, one name to a screen reader. */}
          <span className="portal-label__name" aria-label={t.name}>
            {[...t.name].map((ch, n) => (
              <span key={n} aria-hidden="true" style={{ "--n": n } as React.CSSProperties}>{ch === " " ? "\u00a0" : ch}</span>
            ))}
          </span>
          <span className="portal-label__tag">{t.tagline}</span>
        </a>
      ))}

      {showing3D && (
        <nav className="signpost" aria-label="Signpost">
          {SIGNS.map((sign, i) => (
            <a
              key={sign.label}
              ref={signRefs[i]}
              className="sign-link"
              href={sign.href}
              draggable={false}
              onPointerEnter={() => (signHover.current = i)}
              onPointerLeave={() => (signHover.current = -1)}
              onFocus={() => (signHover.current = i)}
              onBlur={() => (signHover.current = -1)}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                openSign(i);
              }}
            >
              {sign.label}
            </a>
          ))}
        </nav>
      )}

      {showing3D && <p className={`stage__hint${turned ? " gone" : ""}`} aria-hidden="true">Point at a card · Drag to turn</p>}

    </div>
  );
}
