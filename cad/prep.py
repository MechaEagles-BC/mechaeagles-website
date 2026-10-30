"""Assembles the exported parts, UV-unwraps them and bakes contact shadowing, so each part is occluded by its real neighbours.
Run: blender -b --factory-startup --python cad/prep.py"""
import math
import os

import bpy
from mathutils import Matrix

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "foundation")
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")
TEAM_ANGLES = [-135, 135, 45, -45]
PINIONS = [0, 90, 180, 270]
CENTRE = 3.72667
RES = {"plinth": 2048, "ring_gear": 2048, "collar": 1024, "deck_plate": 1024, "bearing_panel": 1024, "fin_ring": 1024, "spar": 1024, "coupler": 1024, "pinion": 512, "post": 256, "shaft": 256, "cap_screw": 128}


def rz(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


def tr(x, y, z):
    return Matrix.Translation((x, y, z))


def polar(radius, deg, z):
    a = math.radians(deg)
    return tr(radius * math.cos(a), radius * math.sin(a), z)


PLACEMENTS = {
    "plinth": [Matrix()],
    "deck_plate": [rz(i * 11.25) for i in range(32)],
    "bearing_panel": [rz(i * 15) for i in range(24)],
    "ring_gear": [tr(0, 0, 0.36)],
    "pinion": [polar(CENTRE, a, 0.36) for a in PINIONS],
    "shaft": [polar(CENTRE, a, 0.34) for a in PINIONS],
    "fin_ring": [Matrix()],
    "collar": [Matrix()],
    "spar": [rz(a) @ tr(0, 0, 0.695) for a in TEAM_ANGLES],
    "post": [rz(a) @ tr(3.4, 0, 0.34) for a in TEAM_ANGLES],
    "coupler": [rz(a) @ tr(8.6, 0, 0.47) for a in TEAM_ANGLES],
    "cap_screw": [tr(9.085, 0, 0.436)],
}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
scene.cycles.device = "GPU" if any(d.use for d in prefs.devices) else "CPU"
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.world = bpy.data.worlds.new("w")
scene.world.light_settings.distance = 0.55
print("BAKE DEVICE", scene.cycles.device, [d.name for d in prefs.devices if d.use])

primary = {}
for name, placements in PLACEMENTS.items():
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=os.path.join(SRC, name + ".obj"), forward_axis="Y", up_axis="Z")
    meshes = [o for o in set(bpy.data.objects) - before if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(set(bpy.data.objects) - before):
        if o is not obj:
            bpy.data.objects.remove(o)
    obj.name = name  # normals come from the CAD mesh's OBJ, so nothing here may recompute them
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.004, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.matrix_world = placements[0]
    for m in placements[1:]:
        dup = obj.copy()
        scene.collection.objects.link(dup)
        dup.matrix_world = m
    primary[name] = obj
    print("PART", name, "tris", sum(len(p.vertices) - 2 for p in obj.data.polygons), "instances", len(placements))
bpy.context.view_layer.update()

for name, obj in primary.items():
    size = RES[name]
    img = bpy.data.images.new(name + "_ao", size, size, alpha=False)
    mat = bpy.data.materials.new(name + "_bake")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="AO", margin=6)
    img.filepath_raw = os.path.join(SRC, name + ".ao.png")
    img.file_format = "PNG"
    img.save()
    obj.data.materials.clear()
    print("BAKED", name)

for name, obj in primary.items():
    keep = obj.matrix_world.copy()
    obj.matrix_world = Matrix()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=os.path.join(SRC, name + ".prepared.glb"), export_format="GLB", use_selection=True, export_materials="NONE", export_normals=True, export_texcoords=True, export_yup=True)
    obj.matrix_world = keep
print("PREP OK")
