"""Prepares the models drawn live: the flying ships, greyed so team colours stay with the teams, and the valley's broadleaf trees, regreened as in land_build.py.
Run: blender -b --factory-startup --python unreal/prep_live.py"""
import json
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(os.path.dirname(HERE), "public")
TINTS = {"MapleTree_Leaves": (0.62, 1.25, 0.36), "BirchTree_Leaves": (0.46, 0.76, 0.26), "Bush_Leaves": (0.42, 0.68, 0.26)}


def shrink(image, size, tint=None, grey=False):
    if image.size[0] == 0:
        return
    if image.size[0] > size:
        image.scale(size, size)
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    luma = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    if grey:
        px[:, :3] = px[:, :3] * 0.08 + luma[:, None] * 0.92
    if tint:
        px[:, :3] = np.clip(luma[:, None] * np.array(tint, dtype=np.float32), 0, 1)
    image.pixels.foreach_set(px.ravel())
    image.update()


def export(path, images="WEBP", quality=80):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_image_format=images, export_image_quality=quality, export_yup=True)
    print("LIVE", os.path.basename(path), os.path.getsize(path))


os.makedirs(os.path.join(PUBLIC, "models", "ships"), exist_ok=True)
for name in ("Zenith", "Imperial", "Bob"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "assets", "ships", name, "glTF", name + ".gltf"))
    for image in bpy.data.images:
        shrink(image, 512, grey=True)
    export(os.path.join(PUBLIC, "models", "ships", name.lower() + ".glb"))

wanted = json.load(open(os.path.join(PUBLIC, "valley", "trees.json"), encoding="utf8"))
paths = {x["name"]: x["path"] for x in json.load(open(os.path.join(HERE, "kit_list.json"), encoding="utf8"))}
bpy.ops.wm.read_factory_settings(use_empty=True)
for name in sorted(wanted):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=paths[name])
    for ob in set(bpy.data.objects) - before:
        if ob.type == "MESH":
            ob.name = name + "." + ob.name
for mat in bpy.data.materials:  # the live trees don't use normal maps, so they aren't worth sending
    if mat.use_nodes:
        for node in list(mat.node_tree.nodes):
            if node.type == "TEX_IMAGE" and node.image and node.image.name.endswith("_Normal"):
                mat.node_tree.nodes.remove(node)
for image in list(bpy.data.images):
    if image.name.endswith("_Normal"):
        bpy.data.images.remove(image)
        continue
    key = next((k for k in TINTS if k.split("_")[0] in image.name and "Leaves" in image.name), None)
    shrink(image, 512, tint=TINTS.get(key) if key else None)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print("TREE tris", sum(len(o.data.polygons) for o in meshes), {o.name: len(o.data.polygons) for o in meshes[:6]})
print("TREE images", [(i.name, i.size[0]) for i in bpy.data.images][:14])
export(os.path.join(PUBLIC, "valley", "trees.glb"))
print("PREP OK")
