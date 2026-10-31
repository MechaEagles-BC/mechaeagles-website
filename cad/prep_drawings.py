"""Converts portal drawings to GLB, each as one mesh centred on the origin. Baldwin-1 comes from the team's own model.
Run: blender -b --factory-startup --python cad/prep_drawings.py -- <baldwin-1.glb>"""
import os
import sys

import bpy
from mathutils import Vector

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")
baldwin = sys.argv[sys.argv.index("--") + 1]


def finish(name):
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    corners = [Vector(c) for c in obj.bound_box]
    lo = Vector(tuple(min(c[i] for c in corners) for i in range(3)))
    hi = Vector(tuple(max(c[i] for c in corners) for i in range(3)))
    centre = (lo + hi) / 2
    obj.data.transform(__import__("mathutils").Matrix.Translation(-centre))
    print("DRAWING", name, "size", [round(v, 3) for v in (hi - lo)], "tris", sum(len(p.vertices) - 2 for p in obj.data.polygons))
    bpy.ops.export_scene.gltf(filepath=os.path.join(SRC, name + ".prepared.glb"), export_format="GLB", use_selection=True, export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=baldwin)
finish("aero_baldwin")
for name in ("combat_robot", "ai_lattice"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=os.path.join(SRC, name + ".obj"), forward_axis="Y", up_axis="Z")
    finish(name)
print("DRAWINGS OK")
