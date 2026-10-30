"""Converts the Gasson parts to GLB for the web. Geometry keeps its normals; the hologram supplies its own materials.
Run: blender -b --factory-startup --python gasson/export.py"""
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "parts")
for name in ("tower", "bay", "massing_rest"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=os.path.join(SRC, name + ".obj"), forward_axis="Y", up_axis="Z")
    bpy.ops.export_scene.gltf(filepath=os.path.join(SRC, name + ".prepared.glb"), export_format="GLB", export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True)
    print("EXPORTED", name)
