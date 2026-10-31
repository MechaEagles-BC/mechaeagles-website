/** Starts the path of flames for one visit to the Legacy page, and gives its graphics memory back when the visitor leaves. */
import { createRoot, type Root } from "react-dom/client";
import LegacyWorld, { type Year } from "./LegacyWorld";

export function mountLegacy(host: HTMLElement, years: Year[], start: number, pick: (i: number) => void, onArrive: () => void, onReady: () => void, onLost: () => void) {
  const root: Root = createRoot(host);
  root.render(<LegacyWorld years={years} start={start} pick={pick} onArrive={onArrive} onReady={onReady} onLost={onLost} />);
  return () => root.unmount();
}
