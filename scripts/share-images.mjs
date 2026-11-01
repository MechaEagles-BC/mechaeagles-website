/** Makes the browser icons and the pictures shown when a page's link is shared. Run it by hand if the logo or one of these photos changes: node scripts/share-images.mjs */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../public");
const INK = "#0a0e16";
const LINKS = { home: "stills/idle-wide.webp", aero: "media/aero/mission-control.webp", baja: "media/baja/frame-prep.webp", about: "media/org/group.webp" };

mkdirSync(join(PUBLIC, "og"), { recursive: true });
for (const [name, from] of Object.entries(LINKS)) {
  await sharp(join(PUBLIC, from)).resize(1200, 630, { fit: "cover", position: "attention" }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(PUBLIC, "og", `${name}.jpg`));
}

const icon = (size, pad, background) => sharp(join(PUBLIC, "brand/eagle.webp")).resize(size - pad * 2, size - pad * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: pad, bottom: pad, left: pad, right: pad, background }).png();
await icon(180, 22, INK).toFile(join(PUBLIC, "apple-touch-icon.png"));
const small = await icon(48, 3, INK).toBuffer();
// An .ico file may simply hold a PNG behind a short header.
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(1, 4);
head.writeUInt8(48, 6);
head.writeUInt8(48, 7);
head.writeUInt16LE(1, 10);
head.writeUInt16LE(32, 12);
head.writeUInt32LE(small.length, 14);
head.writeUInt32LE(22, 18);
writeFileSync(join(PUBLIC, "favicon.ico"), Buffer.concat([head, small]));
console.log("share images and icons written");
