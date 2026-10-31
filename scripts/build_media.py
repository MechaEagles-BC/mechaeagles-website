"""Copies the photos the site uses into public/, resized for the web. Reads the production site's folders and never writes to them.
Run: uv run --no-project --with pillow python -I scripts/build_media.py"""
import shutil
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT.parent.parent / "OneDrive" / "Desktop" / "MechaEagles" / "site"
A = SITE / "src" / "assets"
JOBS = {
    "media/aero/pad-hold": (A / "aero/pad-hold.jpg", 1600), "media/aero/pad-check": (A / "aero/pad-check.jpg", 1600), "media/aero/crew": (A / "aero/crew.jpg", 1600),
    "media/aero/crew-2": (A / "aero/crew-2.jpg", 1600), "media/aero/pad": (A / "aero/pad.jpg", 1600), "media/aero/contrail": (A / "aero/contrail.jpg", 1600),
    "media/aero/motor": (A / "aero/motor.jpg", 1600), "media/aero/field": (A / "aero/field.jpg", 1600), "media/aero/openrocket": (A / "aero/openrocket.png", 1600), "media/aero/baldwin-1": (A / "aero/baldwin-1.png", 1061),
    "media/baja/frame-prep": (A / "shop/h12.jpg", 1200), "media/baja/welding": (A / "shop/h1.jpg", 1200), "media/baja/bench": (A / "shop/h3.jpg", 1600),
    "media/org/group": (A / "team/group-1.png", 1973), "media/org/design-review": (A / "shop/h4.jpg", 1200), "media/org/meeting": (A / "shop/h13.jpg", 1600), "media/org/pairing": (A / "shop/h9.jpg", 1600), "media/org/planning": (A / "shop/h14.jpg", 1600),
    "partners/solidworks": (A / "partners/solidworks.png", 480), "partners/fusion": (A / "partners/fusion.png", 480), "partners/bc-engineering": (A / "partners/bc-engineering.png", 480), "partners/igos": (A / "partners/igos.png", 480),
}
for out, (src, longest) in JOBS.items():
    im = ImageOps.exif_transpose(Image.open(src))
    im.thumbnail((longest, longest), Image.LANCZOS)
    path = ROOT / "public" / f"{out}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, quality=80, method=6)
    print(out, im.size, path.stat().st_size // 1024, "KB")
for name in ("aero-flight.mp4", "aero-flight.webm"):
    shutil.copy(SITE / "public" / "media" / name, ROOT / "public" / "media" / "aero" / name)
