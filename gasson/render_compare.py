"""Renders the tower, gable bay and massing from each photo's solved camera, in a plain stone clay, for comparison.
Run: blender -b --factory-startup --python gasson/render_compare.py -- <out_dir>"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

out_dir = sys.argv[sys.argv.index("--") + 1]
HERE = os.path.dirname(os.path.abspath(__file__))
cams = json.load(open(os.path.join(HERE, "cameras.json")))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
scene.cycles.device = "GPU" if any(d.use for d in prefs.devices) else "CPU"
scene.cycles.samples = 48


def material(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


stone = material("stone", (0.52, 0.5, 0.46))
for name in ("massing_rest", "tower", "bay"):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=os.path.join(HERE, "parts", name + ".obj"), forward_axis="Y", up_axis="Z")
    for o in set(bpy.data.objects) - before:
        if o.type == "MESH":
            o.data.materials.append(stone)

bpy.ops.mesh.primitive_plane_add(size=800, location=(0, 0, -0.02))
bpy.context.object.data.materials.append(material("ground", (0.09, 0.11, 0.08)))
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(-35)))
bpy.context.object.data.energy = 3.4
bpy.context.object.data.angle = math.radians(3)
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.58, 0.8, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.view_settings.view_transform = "AgX"


def camera(cam, size):
    cx, cy, cz, yaw, pitch, f, roll = cam
    a, b = math.radians(yaw), math.radians(pitch)
    fwd = Vector((math.sin(a) * math.cos(b), math.cos(a) * math.cos(b), math.sin(b)))
    right = Vector((math.cos(a), -math.sin(a), 0))
    up = right.cross(fwd)
    r = math.radians(roll)
    right, up = right * math.cos(r) + up * math.sin(r), up * math.cos(r) - right * math.sin(r)
    data = bpy.data.cameras.new("c")
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = 36
    data.lens = f * 36
    data.clip_end = 2000
    ob = bpy.data.objects.new("c", data)
    scene.collection.objects.link(ob)
    m = Matrix((right, up, -fwd)).transposed().to_4x4()
    m.translation = (cx, cy, cz)
    ob.matrix_world = m
    scene.camera = ob
    scene.render.resolution_x, scene.render.resolution_y = size
    return ob


for name, c in cams.items():
    camera(c["cam"], c["size"])
    scene.render.filepath = os.path.join(out_dir, "render_" + name.split(".")[0] + ".png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name)
print("RENDER OK")
