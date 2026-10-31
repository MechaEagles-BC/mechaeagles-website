/**
 * Page shell for the foundation. The poster and controls need no 3D. Scene.tsx downloads only for capable
 * visitors, and everyone else keeps a still image that still responds to the team controls.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TEAMS, type Fx } from "./teams";

const Scene = lazy(() => import("./Scene"));

// Where the nameplate sits in the 1920 x 1080 poster, for visitors and moments without live 3D.
const STILL_ANCHOR = { x: 226, y: 706 };
const STILL = { w: 1920, h: 1080 };

function placeOnStill(el: HTMLElement) {
  const scale = Math.max(innerWidth / STILL.w, innerHeight / STILL.h);
  const half = el.offsetWidth / 2 + 8;
  const x = Math.min(innerWidth - half, Math.max(half, innerWidth / 2 + (STILL_ANCHOR.x - STILL.w / 2) * scale));
  const y = innerHeight / 2 + (STILL_ANCHOR.y - STILL.h / 2) * scale;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
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

export default function Foundation() {
  const live = useMemo(canRun3D, []);
  const fx = useRef<Fx>({ hover: -1, held: -1, pulse: -1, pulseT: 0, rippleT: -1, boost: 0 });
  const [held, setHeld] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [ready, setReady] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const labelRef = useRef<HTMLAnchorElement>(null);
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
  const clear = useCallback(() => select(-1), [select]);
  const onReady = useCallback(() => setReady(true), []);
  const onGiveUp = useCallback(() => setGaveUp(true), []);

  useEffect(() => {
    if (showing3D && ready) return;
    const place = () => labelRef.current && placeOnStill(labelRef.current);
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [showing3D, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [select]);

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
    <div className="lab">
      {showing3D && (
        <div className={`lab__canvas${ready ? " ready" : ""}`} aria-hidden="true">
          <GLBoundary onError={onGiveUp}>
            <Suspense fallback={null}>
              <Scene fx={fx} labelRef={labelRef} onHover={hover} onSelect={select} onReady={onReady} onGiveUp={onGiveUp} onMiss={clear} />
            </Suspense>
          </GLBoundary>
        </div>
      )}

      {/* A real link: it can be focused, copied and opened in a new tab, and needs no 3D. */}
      <a
        ref={labelRef}
        className="portal-label"
        href="/teams/baja/"
        style={{ "--c": TEAMS[0].color } as React.CSSProperties}
        aria-current={held === 0 ? "true" : undefined}
        onPointerEnter={() => hover(0)}
        onPointerLeave={() => hover(-1)}
        onFocus={() => hover(0)}
        onBlur={() => hover(-1)}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault(); // Stage 6 adds the transition. In this prototype a click selects.
          select(0);
        }}
      >
        <span className="portal-label__name">{TEAMS[0].name}</span>
        <span className="portal-label__tag">Off-road vehicle engineering</span>
        <span className="portal-label__note">Illustrative, not team CAD</span>
      </a>

      <header className="lab__head">
        <p className="lab__kicker">MechaEagles · Mission Control</p>
        <h1 className="lab__title">Foundation prototype</h1>
        <p className="lab__note">{showing3D ? "Running live" : "Still image"}. Illustrative machinery, not team hardware.</p>
      </header>

      <div className="lab__foot">
        <p className="lab__status" aria-live="polite">
          {held >= 0 ? `${TEAMS[held].name} selected. In the site this would open the team page. Esc clears.` : "Select a team to send a pulse to the centre."}
        </p>
        <div className="lab__teams" role="group" aria-label="Teams">
          {TEAMS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className="lab__team"
              style={{ "--c": t.color } as React.CSSProperties}
              aria-pressed={held === i}
              onPointerEnter={() => hover(i)}
              onPointerLeave={() => hover(-1)}
              onFocus={() => hover(i)}
              onBlur={() => hover(-1)}
              onClick={() => select(i)}
            >
              <i aria-hidden="true"></i>
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
