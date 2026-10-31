#!/usr/bin/env bash
# Regenerates terrain and placements, then rebuilds and renders, without re-importing the kits.
cd "$(dirname "$0")"; D=$(cygpath -m "$PWD")
U="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor"; UP="C:/Users/vedar/UnrealProjects/HangarIgnition/HangarIgnition.uproject"
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python "$D/landscape.py" 2>&1 | grep -E 'LANDSCAPE OK|Traceback|Error:' | cut -c1-110
uv run --quiet --no-project --with numpy python -I -c "import sys; sys.path.insert(0, '.'); exec(open('scatter.py', encoding='utf8').read())"
"$U-Cmd.exe" "$UP" -run=pythonscript -script="$D/mc_import.py" -unattended -nosplash -abslog="$D/parts/import.log" >/dev/null 2>&1; grep -c MCBOUNDS parts/import.log
"$U.exe" "$UP" -ExecutePythonScript="$D/run_and_quit.py land_build.py" -unattended -nosplash -abslog="$D/parts/build.log" >/dev/null 2>&1; grep -E 'MC BUILD OK|SCRIPT FAILED|NATURE ' parts/build.log | sed 's/.*LogPython: //' | cut -c1-240
"$U.exe" "$UP" -ExecCmds="py $D/mc_render.py plate ${1:-test}" -nop4 -nosplash -abslog="$D/parts/render.log" >/dev/null 2>&1; grep -E 'MC RENDER DONE' parts/render.log | cut -c30-80
