"""Prepares the founder figure from Quaternius' Ultimate Modular Men (CC0): one character, with only the four animations the valley uses.
Run: blender -b --factory-startup --python unreal/prep_founder.py, then compress with npx @gltf-transform/cli meshopt."""
import glob
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = glob.glob(os.path.join(HERE, "assets", "men", "**", "Casual_Hoodie.gltf"), recursive=True)[0]
OUT = os.path.join(os.path.dirname(HERE), "public", "valley", "founder.glb")
KEEP = ("Idle", "Walk", "Wave", "Interact")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
for action in list(bpy.data.actions):
    name = action.name.split("|")[-1]
    if name not in KEEP:
        bpy.data.actions.remove(action)
print("ACTIONS", [a.name for a in bpy.data.actions])
print("SIZE", [tuple(round(v, 2) for v in o.dimensions) for o in bpy.data.objects if o.type == "ARMATURE"], [o.name for o in bpy.data.objects][:6])
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=2, export_yup=True)
print("FOUNDER OK", os.path.getsize(OUT) // 1024, "KB")
