# TouchDesigner experiments

The land at the bottom of Home is made here. Each team is a massif, sized by its headcount in `src/data/members.json` and shaped by its element: Baja broken ground, Aero swept ridges, Combat a caldera, AI Safety terraces. A ridge joins two places once for each person who works in both.

To rebuild it after the roster changes:

1. Open `boot.toe` in TouchDesigner. It loads `boot_exec.py`, which runs `bridge.py`, so scripts can be handed to TouchDesigner from outside.
2. Run `python terrain_gen.py`, which writes `terrain_td.py`, then `python tdrun.py terrain_td.py` to have TouchDesigner render the heights.
3. Encode `height.npy` into `public/models/gasson-land/height-512.png` (red is the high byte and green the low byte), and update `LAND_RANGE` in `src/components/ending/EndingWorld.tsx` to the new minimum and maximum.

The scripts hold absolute paths from the machine they were written on. Change them in `bridge.py`, `boot_exec.py` and `terrain_gen.py`, then point `boot.toe`'s execute DAT at your copy.

Made with TouchDesigner Non-Commercial. Check the licence suits a site with sponsors before this goes public.
