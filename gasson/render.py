"""Plain clay render of the massing for review, not the final hologram. Run: blender -b --factory-startup --python gasson/render.py -- <obj> <png>"""
import math
import sys

import bpy

obj_path, out = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=obj_path, forward_axis="Y", up_axis="Z")
mat = bpy.data.materials.new("clay")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.62, 0.64, 0.68, 1)
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        o.data.materials.append(mat)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(55), 0, math.radians(35)))
bpy.context.object.data.energy = 3.2
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -0.02))
bpy.ops.object.camera_add(location=(62, -165, 38))
cam = bpy.context.object
target = bpy.data.objects.new("t", None)
target.location = (0, 8, 28)
scene.collection.objects.link(target)
c = cam.constraints.new("TRACK_TO")
c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
cam.data.lens = 50
scene.camera = cam
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDER OK")
