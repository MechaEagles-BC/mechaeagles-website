#!/usr/bin/env bash
# Regenerates the space world and renders it. Usage: go_space.sh [test|final] [noimport]. With "noimport" it only rebuilds and renders.
cd "$(dirname "$0")"; D=$(cygpath -m "$PWD")
U="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor"; UP="C:/Users/vedar/UnrealProjects/HangarIgnition/HangarIgnition.uproject"
if [ "$2" != noimport ]; then
  "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python "$D/space_land.py" 2>&1 | grep -E 'SPACE LAND OK|Traceback|Error:' | cut -c1-110
  uv run --quiet --no-project --with numpy --with pillow python -I -c "import sys; sys.path.insert(0, '.'); __file__='space_sky.py'; exec(open('space_sky.py', encoding='utf8').read())"
fi
uv run --quiet --no-project --with numpy python -I -c "import sys; sys.path.insert(0, '.'); __file__='space_scatter.py'; exec(open('space_scatter.py', encoding='utf8').read())"
if [ "$2" != noimport ]; then
  "$U-Cmd.exe" "$UP" -run=pythonscript -script="$D/space_import.py" -unattended -nosplash -abslog="$D/parts/space_import.log" >/dev/null 2>&1; grep -E 'SPACEKIT|SPACEPART|SPACE IMPORT' parts/space_import.log | sed 's/.*LogPython: //' | cut -c1-100
fi
"$U.exe" "$UP" -ExecutePythonScript="$D/run_and_quit.py space_build.py" -unattended -nosplash -abslog="$D/parts/space_build.log" >/dev/null 2>&1; grep -E 'SPACE BUILD OK|SCRIPT FAILED|Error:' parts/space_build.log | sed 's/.*LogPython: //' | cut -c1-240 | head -8
"$U.exe" "$UP" -ExecCmds="py $D/mc_render.py space ${1:-test}" -nop4 -nosplash -abslog="$D/parts/render.log" >/dev/null 2>&1; grep -E 'MC RENDER DONE' parts/render.log | cut -c30-90
