"""Converts the room parts to GLB for Unreal. Run: blender -b --factory-startup --python unreal/room_glb.py"""
import glob
import os

import bpy

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")
for path in glob.glob(os.path.join(SRC, "*.obj")):
    name = os.path.splitext(os.path.basename(path))[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=path, forward_axis="Y", up_axis="Z")
    bpy.context.selected_objects[0].name = name
    bpy.ops.export_scene.gltf(filepath=os.path.join(SRC, name + ".glb"), export_format="GLB", export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True)
print("ROOM GLB OK")
