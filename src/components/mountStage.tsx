/** Starts the homepage stage once. It then lives in the kept part of the page, so returning to Home finds it as it was left. */
import { createRoot } from "react-dom/client";
import Foundation from "./Foundation";

export function mountStage(host: HTMLElement) {
  createRoot(host).render(<Foundation />);
}
