"""Imports the chosen CC0 models under /Game/MissionControl/Kit and logs each mesh's asset path and size.
Run: UnrealEditor-Cmd.exe HangarIgnition.uproject -run=pythonscript -script=kit_import.py"""
import json
import os

import unreal

HERE = r"C:\Users\vedar\MechaEagles-lab\foundation-r3f\unreal"
tools = unreal.AssetToolsHelpers.get_asset_tools()
items = json.load(open(os.path.join(HERE, "kit_list.json"), encoding="utf8"))
tasks = []
for item in items:
    t = unreal.AssetImportTask()
    t.filename = item["path"]
    t.destination_path = "/Game/MissionControl/Kit/" + item["name"]
    t.automated = True
    t.replace_existing = True
    t.save = True
    tasks.append(t)
tools.import_asset_tasks(tasks)
meshes = {}
for item, t in zip(items, tasks):
    for p in t.imported_object_paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            meshes[item["name"]] = p
            b = a.get_bounding_box()
            unreal.log("KIT %s size %.0f %.0f %.0f path %s" % (item["name"], b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, p))
with open(os.path.join(HERE, "kit_meshes.json"), "w", encoding="utf8") as f:
    json.dump(meshes, f)
unreal.log("KIT IMPORT DONE %d of %d" % (len(meshes), len(items)))
