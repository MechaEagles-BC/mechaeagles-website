"""Builds the space level and its cameras, on the same lens and aim as the valley. Rebuilds only what's under /Game/MissionControl.
Run: UnrealEditor.exe HangarIgnition.uproject -ExecutePythonScript="run_and_quit.py space_build.py" """
import json
import math
import os

import unreal

ROOT = "/Game/MissionControl"
# Must match CAMERA in src/components/Scene.tsx, as in land_build.py.
CAM_POS = (0.0, 8.4, 25.0)
CAM_LOOK = (0.0, 3.3, 0.0)
SENSOR_W, SENSOR_H, FOCAL = 36.0, 27.0, 30.27
EXPOSURE = 0.0

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
V = unreal.Vector


def R(pitch=0.0, yaw=0.0, roll=0.0):
    return unreal.Rotator(roll=roll, pitch=pitch, yaw=yaw)


def ue(p):
    return V(p[0] * 100, p[2] * 100, p[1] * 100)


def fresh(name):
    path = ROOT + "/Materials/" + name
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    return tools.create_asset(name, ROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())


def const1(m, v, x, y):
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant, x, y)
    c.set_editor_property("r", v)
    return c


def finish(m):
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def vertex_colour(name, rough):
    m = fresh(name)
    vc = mel.create_material_expression(m, unreal.MaterialExpressionVertexColor, -500, 0)
    mel.connect_material_property(vc, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const1(m, rough, -500, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const1(m, 0.12, -500, 300), "", unreal.MaterialProperty.MP_SPECULAR)
    return finish(m)


def solid(name, rgb, rough, spec=0.2):
    m = fresh(name)
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -500, 0)
    c.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const1(m, rough, -500, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const1(m, spec, -500, 300), "", unreal.MaterialProperty.MP_SPECULAR)
    return finish(m)


def glowing(name, rgb, strength):
    m = fresh(name)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -700, 0)
    c.set_editor_property("constant", unreal.LinearColor(rgb[0] * strength, rgb[1] * strength, rgb[2] * strength, 1.0))
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    return finish(m)


def sky_material(texture, gain):
    m = fresh("M_SpaceSky")
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    t = mel.create_material_expression(m, unreal.MaterialExpressionTextureSample, -700, 0)
    t.set_editor_property("texture", texture)
    t.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
    e = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -400, 0)
    mel.connect_material_expressions(t, "RGB", e, "A")
    mel.connect_material_expressions(const1(m, gain, -700, 200), "", e, "B")
    mel.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    return finish(m)


def hull_material(key, texture):
    """The ship's own texture without its colour: the four team hues stay with the teams."""
    m = fresh("M_Hull_" + key)
    t = mel.create_material_expression(m, unreal.MaterialExpressionTextureSample, -900, 0)
    t.set_editor_property("texture", texture)
    grey = mel.create_material_expression(m, unreal.MaterialExpressionDesaturation, -650, 0)
    mel.connect_material_expressions(t, "RGB", grey, "")
    mel.connect_material_expressions(const1(m, 0.92, -900, 240), "", grey, "Fraction")
    bright = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -420, 0)
    mel.connect_material_expressions(grey, "", bright, "A")
    mel.connect_material_expressions(const1(m, 1.5, -650, 240), "", bright, "B")
    mel.connect_material_property(bright, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const1(m, 0.5, -420, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const1(m, 0.25, -420, 300), "", unreal.MaterialProperty.MP_METALLIC)
    return finish(m)


HERE = os.path.dirname(os.path.abspath(__file__))
PLACED = json.load(open(os.path.join(HERE, "space_placements.json"), encoding="utf8"))
MESHES = json.load(open(os.path.join(HERE, "space_meshes.json"), encoding="utf8"))

sm_sub = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
for key, path in MESHES.items():
    asset = unreal.load_asset(path)
    if isinstance(asset, unreal.StaticMesh):
        ns = asset.get_editor_property("nanite_settings")
        if ns.enabled:  # as in the valley: Nanite's fallback meshes wreck small models
            ns.enabled = False
            sm_sub.set_nanite_settings(asset, ns, True)
            eal.save_loaded_asset(asset)

MOON = vertex_colour("M_Moon", 0.96)
ROCK = solid("M_MoonRock", (0.075, 0.078, 0.085), 0.92, 0.15)
PROP = solid("M_MoonProp", (0.18, 0.19, 0.2), 0.55, 0.3)
LAMP = glowing("M_LandingLamp", (0.86, 0.95, 0.96), 5.0)
ENGINE = glowing("M_EngineGlow", (0.72, 0.95, 1.0), 9.0)
SKY = sky_material(unreal.load_asset(MESHES["__sky"]), 0.85)
# Where each flying ship's engines sit, in the model's own centimetres, measured from its imported bounds.
ENGINES = {"Imperial": [(-230, -690, 50), (230, -690, 50), (0, -690, 90)], "Zenith": [(-95, -370, 0), (95, -370, 0)], "Bob": [(-120, -275, 10), (120, -275, 10)]}

HULLS = {}


def hull_for(name):
    if name not in HULLS:
        texture = None
        for asset_path in eal.list_assets(ROOT + "/Space/" + name, recursive=True, include_folder=False):
            a = unreal.load_asset(asset_path.split(".")[0])
            if isinstance(a, unreal.Texture):
                texture = a
                break
        HULLS[name] = hull_material(name, texture) if texture else PROP
    return HULLS[name]


def spawn_mesh(key, mat, cast=True):
    a = actors.spawn_actor_from_object(unreal.load_asset(MESHES[key]), V(0, 0, 0), R())
    c = a.static_mesh_component
    c.set_mobility(unreal.ComponentMobility.MOVABLE)
    c.set_material(0, mat)
    c.set_editor_property("cast_shadow", cast)
    a.set_actor_label(key)
    return a


def build(map_path):
    if eal.does_asset_exist(map_path):
        levels.load_level(map_path)
        actors.destroy_actors(actors.get_all_level_actors())
    else:
        levels.new_level(map_path)
    spawn_mesh("moon_near", MOON)
    spawn_mesh("moon_far", MOON)
    spawn_mesh("space_sky", SKY, cast=False)
    cone = unreal.load_asset("/Engine/BasicShapes/Sphere")
    for it in PLACED["items"]:
        mesh = unreal.load_asset(MESHES[it["name"]])
        a = actors.spawn_actor_from_object(mesh, V(it["x"] * 100, -it["y"] * 100, it["z"] * 100), R(pitch=it["pitch"], yaw=it["yaw"], roll=it["roll"]))
        a.set_actor_scale3d(V(it["scale"], it["scale"], it["scale"]))
        c = a.static_mesh_component
        c.set_mobility(unreal.ComponentMobility.MOVABLE)
        a.set_actor_label(it["name"])
        pack = it["pack"]
        if pack == "nature":
            for i in range(c.get_num_materials()):
                c.set_material(i, ROCK)
        elif pack == "ships":
            for i in range(c.get_num_materials()):
                c.set_material(i, hull_for(it["name"]))
            c.set_editor_property("cast_shadow", not it.get("sky"))
            if it.get("sky"):
                t = a.get_actor_transform()
                for ex, ey, ez in ENGINES.get(it["name"], ()):
                    e = actors.spawn_actor_from_object(cone, unreal.MathLibrary.transform_location(t, V(ex, ey - 90, ez)), a.get_actor_rotation())
                    e.set_actor_scale3d(V(0.42 * it["scale"], 2.6 * it["scale"], 0.42 * it["scale"]))
                    ec = e.static_mesh_component
                    ec.set_mobility(unreal.ComponentMobility.MOVABLE)
                    ec.set_material(0, ENGINE)
                    ec.set_editor_property("cast_shadow", False)
    for g in PLACED["glows"]:
        a = actors.spawn_actor_from_object(cone, V(g["x"] * 100, -g["y"] * 100, g["z"] * 100), R())
        a.set_actor_scale3d(V(g["scale"], g["scale"], g["scale"]))
        c = a.static_mesh_component
        c.set_mobility(unreal.ComponentMobility.MOVABLE)
        c.set_material(0, LAMP)
        c.set_editor_property("cast_shadow", False)
    # Hard sunlight from the same place as the valley's, so the live platform's shadows still agree with the picture.
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, V(0, 0, 3000), R(pitch=-50, yaw=-60))
    sc = sun.light_component
    sc.set_editor_property("intensity", 3.4)
    sc.set_editor_property("light_color", unreal.Color(238, 246, 255, 255))
    sc.set_editor_property("light_source_angle", 0.35)
    sc.set_mobility(unreal.ComponentMobility.MOVABLE)
    sun.set_actor_label("Sun")
    # Pale teal from the galaxy behind, to lift the silhouettes off the sky.
    rim = actors.spawn_actor_from_class(unreal.DirectionalLight, V(0, 0, 3000), R(pitch=-14, yaw=118))
    rc = rim.light_component
    rc.set_editor_property("intensity", 0.9)
    rc.set_editor_property("light_color", unreal.Color(236, 222, 170, 255))
    rc.set_editor_property("cast_shadows", False)
    rc.set_mobility(unreal.ComponentMobility.MOVABLE)
    rim.set_actor_label("Galaxy light")
    light = actors.spawn_actor_from_class(unreal.SkyLight, V(0, 0, 500), R())
    lc = light.light_component
    lc.set_editor_property("source_type", unreal.SkyLightSourceType.SLS_SPECIFIED_CUBEMAP)
    lc.set_editor_property("intensity", 0.0)
    lc.set_mobility(unreal.ComponentMobility.MOVABLE)
    light.set_actor_label("No sky fill")
    fill = actors.spawn_actor_from_class(unreal.DirectionalLight, V(0, 0, 3000), R(pitch=-70, yaw=60))
    fc = fill.light_component
    fc.set_editor_property("intensity", 0.28)
    fc.set_editor_property("light_color", unreal.Color(255, 226, 205, 255))
    fc.set_editor_property("cast_shadows", False)
    fc.set_mobility(unreal.ComponentMobility.MOVABLE)
    fill.set_actor_label("Planet shine")
    ppv = actors.spawn_actor_from_class(unreal.PostProcessVolume, V(0, 0, 0), R())
    ppv.set_editor_property("unbound", True)
    ps = ppv.settings
    for key, val in {
        "override_auto_exposure_method": True, "auto_exposure_method": unreal.AutoExposureMethod.AEM_MANUAL,
        "override_auto_exposure_apply_physical_camera_exposure": True, "auto_exposure_apply_physical_camera_exposure": False,
        "override_auto_exposure_bias": True, "auto_exposure_bias": EXPOSURE,
        "override_bloom_intensity": True, "bloom_intensity": 0.28,
        "override_vignette_intensity": True, "vignette_intensity": 0.0,
        "override_motion_blur_amount": True, "motion_blur_amount": 0.0,
        "override_lens_flare_intensity": True, "lens_flare_intensity": 0.0,
        "override_scene_fringe_intensity": True, "scene_fringe_intensity": 0.0,
    }.items():
        ps.set_editor_property(key, val)
    ppv.set_editor_property("settings", ps)
    ppv.set_actor_label("Grade")
    levels.save_current_level()


def camera(label, focal, sensor):
    c = actors.spawn_actor_from_class(unreal.CineCameraActor, V(0, 0, 200), R())
    cc = c.get_cine_camera_component()
    fb = cc.filmback
    fb.set_editor_property("sensor_width", sensor[0])
    fb.set_editor_property("sensor_height", sensor[1])
    cc.set_editor_property("filmback", fb)
    cc.set_editor_property("current_focal_length", focal)
    fs = cc.focus_settings
    fs.set_editor_property("focus_method", unreal.CameraFocusMethod.DISABLE)
    cc.set_editor_property("focus_settings", fs)
    c.set_actor_label(label)
    return c


def sequence(path, label, sensor, p, pitch, yaw):
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    folder, name = path.rsplit("/", 1)
    seq = tools.create_asset(name, folder, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    seq.set_display_rate(unreal.FrameRate(24, 1))
    seq.set_playback_start(0)
    seq.set_playback_end(1)
    cut = seq.add_track(unreal.MovieSceneCameraCutTrack)
    b = seq.add_possessable(camera(label, FOCAL, sensor))
    t = b.add_track(unreal.MovieScene3DTransformTrack)
    s = t.add_section()
    s.set_range(0, 1)
    ch = s.get_all_channels()
    for j, val in enumerate((p.x, p.y, p.z, 0.0, pitch, yaw, 1, 1, 1)):
        ch[j].add_key(unreal.FrameNumber(0), val)
    sec = cut.add_section()
    sec.set_range(0, 1)
    try:
        sec.set_camera_binding_id(unreal.MovieSceneSequenceExtensions.get_portable_binding_id(seq, seq, b))
    except Exception:
        sec.set_camera_binding_id(seq.get_binding_id(b))
    eal.save_loaded_asset(seq)
    levels.save_current_level()


d = (CAM_LOOK[0] - CAM_POS[0], CAM_LOOK[2] - CAM_POS[2], CAM_LOOK[1] - CAM_POS[1])
yaw = math.degrees(math.atan2(d[1], d[0]))
pitch = math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))
build(ROOT + "/Maps/MC_Space")
sequence(ROOT + "/Seq_Space", "Cam_Space", (SENSOR_W, SENSOR_H), ue(CAM_POS), pitch, yaw)
sequence(ROOT + "/Seq_SpaceWide", "Cam_SpaceWide", (SENSOR_W * 1.5, SENSOR_H), ue(CAM_POS), pitch, yaw)
sequence(ROOT + "/Seq_SpaceTall", "Cam_SpaceTall", (SENSOR_W, SENSOR_H * 10 / 3), ue(CAM_POS), pitch, yaw)
unreal.log("SPACE BUILD OK pitch %.2f yaw %.2f" % (pitch, yaw))
