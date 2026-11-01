/**
 * Makes smaller copies and a tiny blurred preview of each photo, so a small tile never downloads a full-size picture and a frame is never empty.
 * Runs before every build and only does work for new or changed photos. A copy's name carries a hash of its photo, so a changed photo gets a new address and can't show stale.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(PUBLIC, "img");
const MANIFEST = join(ROOT, "src/data/images.json");
const SETS = [
  { dir: "people", widths: [120, 240, 360, 480] },
  { dir: "media", widths: [320, 640, 960, 1440] },
];
const QUALITY = 78;

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const manifest = {};
const keep = new Set();
let sharp = null;
let made = 0;

mkdirSync(OUT, { recursive: true });
for (const set of SETS) {
  for (const file of walk(join(PUBLIC, set.dir)).sort()) {
    if (!/\.(webp|jpe?g|png)$/.test(file)) continue;
    const src = `/${relative(PUBLIC, file).replaceAll("\\", "/")}`;
    const bytes = readFileSync(file);
    const hash = createHash("sha256").update(bytes).update(String(QUALITY)).digest("hex").slice(0, 10);
    const stem = src.slice(1).replace(/\.\w+$/, "").replaceAll("/", "-");
    const was = old[src];
    if (was?.hash === hash && was.set.every(([, url]) => url === src || existsSync(join(PUBLIC, url)))) {
      manifest[src] = was;
      was.set.forEach(([, url]) => keep.add(url));
      continue;
    }
    sharp ??= (await import("sharp")).default;
    const { width, height } = await sharp(bytes).metadata();
    const entries = [];
    for (const w of set.widths.filter((x) => x < width)) {
      const url = `/img/${stem}-${hash}-${w}.webp`;
      const copy = await sharp(bytes).resize({ width: w }).webp({ quality: QUALITY, smartSubsample: true, effort: 6 }).toBuffer();
      // A copy is only worth having if it's meaningfully smaller than the photo itself.
      if (copy.length >= bytes.length * 0.9) continue;
      writeFileSync(join(PUBLIC, url), copy);
      keep.add(url);
      entries.push([w, url]);
      made++;
    }
    entries.push([width, src]);
    const tiny = await sharp(bytes).resize({ width: 24 }).blur(0.6).webp({ quality: 40 }).toBuffer();
    manifest[src] = { hash, w: width, h: height, preview: `data:image/webp;base64,${tiny.toString("base64")}`, set: entries };
  }
}
for (const name of readdirSync(OUT)) if (!keep.has(`/img/${name}`)) rmSync(join(OUT, name));
const text = `${JSON.stringify(manifest, null, 1)}\n`;
if (!existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== text) writeFileSync(MANIFEST, text);
console.log(`images: ${Object.keys(manifest).length} photos, ${made} new copies`);
