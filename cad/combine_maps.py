"""Packs baked shadowing (red) and edge wear (green) into one map, at most 1024 px."""
import sys

from PIL import Image

ao_path, edge_path, out = sys.argv[1:]
ao = Image.open(ao_path).convert("L")
edge = Image.open(edge_path).convert("L")
if ao.width > 1024:
    ao, edge = ao.resize((1024, 1024), Image.LANCZOS), edge.resize((1024, 1024), Image.LANCZOS)
blank = Image.new("L", ao.size, 0)
Image.merge("RGB", (ao, edge, blank)).save(out, "WEBP", quality=74, method=6)
