"""Prepares the one ship that flies live: its colour taken out, because the team hues stay with the teams, and its texture small enough to send.
Run: blender -b --factory-startup --python unreal/prep_ship.py"""
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = "Zenith"
OUT = os.path.join(os.path.dirname(HERE), "public", "models", "ships")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "assets", "ships", NAME, "glTF", NAME + ".gltf"))
for image in bpy.data.images:
    if image.size[0] == 0:
        continue
    image.scale(512, 512)
    px = np.empty(512 * 512 * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    grey = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    px[:, :3] = px[:, :3] * 0.08 + grey[:, None] * 0.92
    image.pixels.foreach_set(px.ravel())
    image.update()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME.lower() + ".glb"), export_format="GLB", export_image_format="WEBP", export_image_quality=80, export_yup=True)
print("SHIP OK", os.path.getsize(os.path.join(OUT, NAME.lower() + ".glb")))
