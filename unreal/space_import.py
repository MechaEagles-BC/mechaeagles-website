"""Imports the space world's terrain, sky and CC0 models under /Game/MissionControl and writes space_meshes.json. Rocks already imported for the valley are reused.
Run: UnrealEditor-Cmd.exe HangarIgnition.uproject -run=pythonscript -script=space_import.py"""
import json
import os

import unreal

HERE = r"C:\Users\vedar\MechaEagles-lab\foundation-r3f\unreal"
ROOT = "/Game/MissionControl"
tools = unreal.AssetToolsHelpers.get_asset_tools()
items = json.load(open(os.path.join(HERE, "space_list.json"), encoding="utf8"))
known = json.load(open(os.path.join(HERE, "kit_meshes.json"), encoding="utf8"))


def task(filename, destination):
    t = unreal.AssetImportTask()
    t.filename = filename
    t.destination_path = destination
    t.automated = True
    t.replace_existing = True
    t.save = True
    return t


meshes = {}
models, tasks = [], []
for item in items:
    if item["pack"] == "nature" and item["name"] in known:
        meshes[item["name"]] = known[item["name"]]
        continue
    models.append(item)
    tasks.append(task(item["path"], ROOT + "/Space/" + item["name"]))
parts = ["moon_near", "moon_far", "space_sky"]
part_tasks = [task(os.path.join(HERE, "parts", p + ".glb"), ROOT + "/Parts/" + p) for p in parts]
sky_task = task(os.path.join(HERE, "parts", "T_SpaceSky.png"), ROOT + "/Space/Sky")
tools.import_asset_tasks(tasks + part_tasks + [sky_task])

for item, t in zip(models, tasks):
    for p in t.imported_object_paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            meshes[item["name"]] = p
            b = a.get_bounding_box()
            unreal.log("SPACEKIT %s min %.0f %.0f %.0f max %.0f %.0f %.0f" % (item["name"], b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z))
for name, t in zip(parts, part_tasks):
    for p in t.imported_object_paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            meshes[name] = p
            b = a.get_bounding_box()
            unreal.log("SPACEPART %s min %.0f %.0f %.0f max %.0f %.0f %.0f" % (name, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z))
for p in sky_task.imported_object_paths:
    sky = unreal.load_asset(p)
    if isinstance(sky, unreal.Texture):
        # Uncompressed, or the dark gradients and faint stars break up, and no shrinking.
        sky.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_EDITOR_ICON)
        sky.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_UI)
        sky.set_editor_property("mip_gen_settings", unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
        unreal.EditorAssetLibrary.save_loaded_asset(sky)
        meshes["__sky"] = p
with open(os.path.join(HERE, "space_meshes.json"), "w", encoding="utf8") as f:
    json.dump(meshes, f)
unreal.log("SPACE IMPORT DONE %d" % len(meshes))
