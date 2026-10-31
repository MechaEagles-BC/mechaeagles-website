"""Converts the Nature pack's FBX-only models to glTF, wiring each material to its texture from the pack, with leaves alpha-tested.
Run: blender -b --factory-startup --python unreal/fbx_convert.py"""
import glob
import os
import shutil

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = glob.glob(os.path.join(HERE, "assets", "nature_fbx", "*"))[0]
OUT = os.path.join(HERE, "assets", "nature", "converted")
os.makedirs(OUT, exist_ok=True)
TEX = os.path.join(SRC, "Textures")
NAMES = [f"NormalTree_{i}" for i in range(1, 6)] + [f"PineTree_{i}" for i in range(1, 6)] + [f"Rock_{i}" for i in range(1, 6)] + ["Plant_1", "Plant_2", "Plant_Flowers"]

for name in NAMES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, "FBX", name + ".fbx"))
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m:
                continue
            base = m.name.split(".")[0]
            base = {"Rock": "Rocks"}.get(base, base)
            path = os.path.join(TEX, base + ".png")
            if not os.path.exists(path):
                print("NOTEX", name, base)
                continue
            m.use_nodes = True
            nt = m.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            img = nt.nodes.new("ShaderNodeTexImage")
            img.image = bpy.data.images.load(path)
            nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.9
            if "Leaves" in base or base in ("Flowers", "Grass"):
                nt.links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"])
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    size = [round(v, 2) for v in obj.dimensions]
    # the pack's FBX files come in at centimetre scale
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".gltf"), export_format="GLTF_SEPARATE", use_selection=True, export_image_format="AUTO", export_yup=True)
    print("CONV", name, "size", size, "mats", [s.material.name for s in obj.material_slots if s.material])
print("CONVERT OK")
