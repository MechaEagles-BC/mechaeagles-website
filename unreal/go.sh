#!/usr/bin/env bash
# Rebuilds the room. Usage: go.sh [cad] [mode]. With "cad" it also re-exports geometry.
cd "$(dirname "$0")"; D=$(cygpath -m "$PWD")
U="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor"; UP="C:/Users/vedar/UnrealProjects/HangarIgnition/HangarIgnition.uproject"
if [ "$1" = cad ]; then
  ~/.local/bin/cadgen.cmd +0.8.3 run room_cad.py 2>&1 | grep -E 'arch tris|rror|Traceback'; ~/.local/bin/cadgen.cmd +0.8.3 stop >/dev/null 2>&1
  "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python "$D/fbx_convert.py" 2>&1 | grep -E 'CONVERT OK|Traceback'
  "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python "$D/room_glb.py" 2>&1 | grep -E 'ROOM GLB OK|Traceback'
  "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python "$D/landscape.py" 2>&1 | grep -E '^LAND|Traceback|Error' | cut -c1-110
  uv run --quiet --no-project --with numpy python -I -c "import sys; sys.path.insert(0, '.'); exec(open('scatter.py', encoding='utf8').read())"
  "$U-Cmd.exe" "$UP" -run=pythonscript -script="$D/kit_import.py" -unattended -nosplash -abslog="$D/parts/kit.log" >/dev/null 2>&1; grep -E 'KIT IMPORT' parts/kit.log | cut -c30-90
  "$U-Cmd.exe" "$UP" -run=pythonscript -script="$D/mc_import.py" -unattended -nosplash -abslog="$D/parts/import.log" >/dev/null 2>&1; grep -c MCBOUNDS parts/import.log
fi
"$U.exe" "$UP" -ExecutePythonScript="$D/run_and_quit.py land_build.py" -unattended -nosplash -abslog="$D/parts/build.log" >/dev/null 2>&1; grep -E 'MC BUILD OK|SCRIPT FAILED' parts/build.log | cut -c1-120
"$U.exe" "$UP" -ExecCmds="py $D/mc_render.py plate ${2:-test}" -nop4 -nosplash -abslog="$D/parts/render.log" >/dev/null 2>&1; grep -E 'MC RENDER DONE' parts/render.log | cut -c30-90
