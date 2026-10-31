"""Generates the space world's small moon and the flat backdrop the sky is painted on. An invented place.
Same coordinates as landscape.py: metres, +Z up, the viewer on the -Y side, the platform at the origin.
Run: blender -b --factory-startup --python unreal/space_land.py"""
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from space_height import colours, height, smooth, SKY_U, SKY_V, sky_point  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")


def write_glb(name, verts, faces, cols=None, uvs=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    me.loops.add(faces.size)
    me.loops.foreach_set("vertex_index", faces.astype(np.int32).ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set("loop_start", np.arange(0, faces.size, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    if cols is not None:
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        attr.data.foreach_set("color", np.concatenate([cols, np.ones((len(cols), 1))], axis=1).ravel().astype(np.float32))
        me.color_attributes.active_color = attr
    if uvs is not None:
        layer = me.uv_layers.new(name="UV")
        layer.data.foreach_set("uv", uvs[faces.ravel()].astype(np.float32).ravel())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"), export_format="GLB", export_materials="NONE", export_normals=True, export_texcoords=uvs is not None, export_yup=True, export_vertex_color="ACTIVE" if cols is not None else "NONE")
    print("SPACE", name, "verts", len(verts), "tris", len(faces))


def grid(x0, x1, y0, y1, nx, ny, drop=None):
    x, y = np.meshgrid(np.linspace(x0, x1, nx), np.linspace(y0, y1, ny))
    h = height(x, y)
    verts = np.stack([x, y, (h if drop is None else h - drop(x, y))], -1).reshape(-1, 3)
    i = np.arange(ny - 1)[:, None] * nx + np.arange(nx - 1)[None, :]
    faces = np.concatenate([np.stack([i, i + 1, i + nx + 1], -1).reshape(-1, 3), np.stack([i, i + nx + 1, i + nx], -1).reshape(-1, 3)])
    return verts, faces, colours(x, y).reshape(-1, 3)


os.makedirs(OUT, exist_ok=True)
NEAR = (-90.0, 90.0, -40.0, 120.0)
write_glb("moon_near", *grid(*NEAR, 800, 720))
# the far sheet sits a little lower where the near sheet covers it
drop = lambda x, y: 1.5 * (1 - smooth(0, 12, np.maximum.reduce([NEAR[0] - x, x - NEAR[1], NEAR[2] - y, y - NEAR[3]])))
write_glb("moon_far", *grid(-420, 420, -120, 420, 560, 420, drop))

corners = [sky_point(u, v) for u, v in ((SKY_U[0], SKY_V[0]), (SKY_U[1], SKY_V[0]), (SKY_U[1], SKY_V[1]), (SKY_U[0], SKY_V[1]))]
write_glb("space_sky", np.array(corners), np.array([[0, 1, 2], [0, 2, 3]]), uvs=np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]))
print("SPACE LAND OK")
