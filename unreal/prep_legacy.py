"""Prepares the Legacy page's props from Quaternius' Fantasy Props MegaKit (CC0): one GLB, each prop a named node at the origin.
Weapons are left out, and so is anything that doesn't belong in a workshop. Normal maps stay, because torchlight needs them; the rest shrinks.
Run: blender -b --factory-startup --python unreal/prep_legacy.py, then compress with npx @gltf-transform/cli meshopt."""
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, "assets", "fantasy", "Exports", "glTF")
OUT = os.path.join(os.path.dirname(HERE), "public", "legacy", "props.glb")
PROPS = ["Torch_Metal", "Anvil", "Anvil_Log", "Workbench", "Workbench_Drawers", "Banner_1", "Banner_1_Cloth", "Banner_2", "Banner_2_Cloth", "Scroll_1", "Scroll_2", "Book_Stack_1", "Book_Stack_2", "BookStand", "Chest_Wood", "CandleStick_Stand", "CandleStick_Triple", "Table_Large", "Bench", "Stool", "Chain_Coil", "Crate_Wooden", "Crate_Metal", "Bucket_Metal", "Rope_1", "Coin_Pile", "Lantern_Wall", "Whetstone"]
SIZE = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
for name in PROPS:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KIT, name + ".gltf"))
    new = set(bpy.data.objects) - before
    roots = [o for o in new if o.parent is None or o.parent not in new]
    meshes = [o for o in new if o.type == "MESH"]
    print("PROP", name, "roots", [r.name for r in roots], "tris", sum(len(m.data.polygons) for m in meshes), "materials", sorted({s.material.name for m in meshes for s in m.material_slots if s.material}), "loc", [tuple(round(v, 2) for v in r.location) for r in roots][:1])
    # One empty for each prop with a name the page can ask for, whatever the kit called its parts.
    holder = bpy.data.objects.new("P_" + name, None)
    bpy.context.scene.collection.objects.link(holder)
    for r in roots:
        r.parent = holder
for mat in bpy.data.materials:  # roughness and metal come from the factors: the third map costs more than it shows
    if mat.use_nodes:
        for node in list(mat.node_tree.nodes):
            if node.type == "TEX_IMAGE" and node.image and "_ORM" in node.image.name:
                bpy.data.images.remove(node.image)
                mat.node_tree.nodes.remove(node)
for image in bpy.data.images:
    print("IMAGE", image.name, image.size[0], image.size[1])
    if image.size[0] > SIZE:
        image.scale(SIZE, SIZE)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_image_format="WEBP", export_image_quality=78, export_yup=True)
print("LEGACY OK", os.path.getsize(OUT) // 1024, "KB")
