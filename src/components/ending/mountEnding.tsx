/** Starts the living map for one visit to Home, and gives its graphics memory back when the visitor leaves. */
import { createRoot, type Root } from "react-dom/client";
import EndingWorld from "./EndingWorld";

export function mountEnding(host: HTMLElement, onReady: () => void, onLost: () => void) {
  const root: Root = createRoot(host);
  const render = (active: boolean) => root.render(<EndingWorld onReady={onReady} onLost={onLost} active={active} />);
  render(true);
  return { setActive: render, unmount: () => root.unmount() };
}
