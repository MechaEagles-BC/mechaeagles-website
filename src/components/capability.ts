/** Who gets the live world, and who gets the still picture. Also used by the sky, so the two always agree. */
export function canRun3D() {
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
