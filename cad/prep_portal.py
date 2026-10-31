"""Bakes contact shadowing and edge wear for the portal frame, and converts the drawing to GLB. Keeps normals from the CAD mesh.
Run: blender -b --factory-startup --python cad/prep_portal.py"""
import math
import os

import bpy

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(SRC, "baja_corner.obj"), forward_axis="Y", up_axis="Z")
bpy.ops.export_scene.gltf(filepath=os.path.join(SRC, "baja_corner.prepared.glb"), export_format="GLB", export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True)

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
scene.world.light_settings.distance = 0.6

bpy.ops.wm.obj_import(filepath=os.path.join(SRC, "portal_frame.obj"), forward_axis="Y", up_axis="Z")
obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.004, scale_to_bounds=True)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.001))
obj.select_set(False)

size = 1024
ao = bpy.data.images.new("ao", size, size, alpha=False)
mat = bpy.data.materials.new("bake")
mat.use_nodes = True
nt = mat.node_tree
node = nt.nodes.new("ShaderNodeTexImage")
node.image = ao
nt.nodes.active = node
obj.data.materials.append(mat)
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.bake(type="AO", margin=6)
ao.filepath_raw = os.path.join(SRC, "portal_frame.ao.png")
ao.file_format = "PNG"
ao.save()

edge = bpy.data.images.new("edge", size, size, alpha=False)
node.image = edge
bevel = nt.nodes.new("ShaderNodeBevel")
bevel.samples = 8
bevel.inputs["Radius"].default_value = 0.012
geo = nt.nodes.new("ShaderNodeNewGeometry")
dist = nt.nodes.new("ShaderNodeVectorMath")
dist.operation = "DISTANCE"
gain = nt.nodes.new("ShaderNodeMath")
gain.operation = "MULTIPLY"
gain.inputs[1].default_value = 1.6
emit = nt.nodes.new("ShaderNodeEmission")
out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
nt.links.new(bevel.outputs["Normal"], dist.inputs[0])
nt.links.new(geo.outputs["Normal"], dist.inputs[1])
nt.links.new(dist.outputs["Value"], gain.inputs[0])
nt.links.new(gain.outputs[0], emit.inputs["Strength"])
nt.links.new(emit.outputs[0], out.inputs["Surface"])
scene.cycles.samples = 16
nt.nodes.active = node
bpy.ops.object.bake(type="EMIT", margin=6)
edge.filepath_raw = os.path.join(SRC, "portal_frame.edge.png")
edge.file_format = "PNG"
edge.save()

obj.data.materials.clear()
bpy.ops.export_scene.gltf(filepath=os.path.join(SRC, "portal_frame.prepared.glb"), export_format="GLB", use_selection=True, export_materials="NONE", export_normals=True, export_texcoords=True, export_yup=True)
print("PORTAL PREP OK")
