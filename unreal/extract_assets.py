"""Extracts the glTF models from the CC0 Quaternius packs. Skips .blend files, which can contain scripts.
Run: python -I unreal/extract_assets.py"""
import os
import re
import zipfile
from pathlib import Path

A = Path(__file__).resolve().parent / "assets"
D = Path.home() / "Downloads"
KEEP = re.compile(r"\.(gltf|bin|png|jpg|txt)$", re.I)


def extract(zip_name, dest):
    root = (A / dest).resolve()
    count = 0
    with zipfile.ZipFile(D / zip_name) as z:
        for info in z.infolist():
            name = info.filename.replace(chr(92), "/")
            if info.is_dir() or not KEEP.search(name):
                continue
            path = (root / name).resolve()
            if not str(path).startswith(str(root)):
                raise ValueError("unsafe path in archive: " + name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(z.read(info))
            count += 1
    print(dest, count, "files")


extract("Fantasy Props MegaKit[Standard].zip", "props")
extract("Ultimate Stylized Nature - May 2022-20261031T013358Z-1-001.zip", "nature")
extract("Sci-Fi Essentials Kit[Standard].zip", "scifi")
