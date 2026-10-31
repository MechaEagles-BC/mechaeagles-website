"""Imports the room parts under /Game/MissionControl/Parts and logs each mesh's bounds, to calibrate axes. Touches nothing else.
Run: UnrealEditor-Cmd.exe HangarIgnition.uproject -run=pythonscript -script=mc_import.py"""
import glob
import os

import unreal

SRC = r"C:\Users\vedar\MechaEagles-lab\foundation-r3f\unreal\parts"
tools = unreal.AssetToolsHelpers.get_asset_tools()
tasks = []
for path in sorted(glob.glob(os.path.join(SRC, "*.glb"))):
    name = os.path.splitext(os.path.basename(path))[0]
    if name not in ("land_near", "land_far", "trees", "arch"):
        continue  # proxies are already in the project
    t = unreal.AssetImportTask()
    t.filename = path
    t.destination_path = "/Game/MissionControl/Parts/" + name
    t.automated = True
    t.replace_existing = True
    t.save = True
    tasks.append(t)
tools.import_asset_tasks(tasks)
for t in tasks:
    for p in t.imported_object_paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            b = a.get_bounding_box()
            unreal.log("MCBOUNDS %s min %.1f %.1f %.1f max %.1f %.1f %.1f path %s" % (os.path.basename(t.filename), b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, p))
unreal.log("MCIMPORT DONE")
