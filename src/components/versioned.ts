/**
 * A public file's address with a short fingerprint of its contents, worked out at build time. Pictures that keep their names when they're redrawn,
 * like the stills, get a new address whenever they change, so nobody is shown an old copy from a cache.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const seen = new Map<string, string>();

export function versioned(path: string) {
  let url = seen.get(path);
  if (!url) {
    try {
      const hash = createHash("sha256").update(readFileSync(join(process.cwd(), "public", path))).digest("hex").slice(0, 8);
      url = `${path}?v=${hash}`;
    } catch {
      url = path; // a missing file simply keeps its plain address
    }
    seen.set(path, url);
  }
  return url;
}
