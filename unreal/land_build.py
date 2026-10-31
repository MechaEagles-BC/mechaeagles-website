"""Builds the Mission Control landscape level and its cameras. Rebuilds only what's under /Game/MissionControl.
Axes, measured from imported bounds: UE x = scene x, UE y = scene z, UE z = scene y, all x100 (cm).
Run: UnrealEditor.exe HangarIgnition.uproject -ExecutePythonScript="run_and_quit.py land_build.py" """
import json
import math
import os
import unreal

ROOT = "/Game/MissionControl"
TEAMS = [(1.0, 0.36, 0.04), (0.16, 0.47, 1.0), (1.0, 0.045, 0.014), (0.33, 0.26, 1.0)]
TEAM_ANGLES = [-150, 150, 30, -30]
PANEL_RADIUS = 10.3
# Must match CAMERA in src/components/Scene.tsx. The film is 4:3, and a 16:9 window sees its middle band at a 37 degree lens.
CAM_POS = (0.0, 8.4, 25.0)
CAM_LOOK = (0.0, 3.3, 0.0)
SENSOR_W, SENSOR_H, FOCAL = 36.0, 27.0, 30.27

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


def fresh(path):
    if eal.does_asset_exist(path):
        eal.delete_asset(path)


def const1(m, v, x, y):
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant, x, y)
    c.set_editor_property("r", v)
    return c


def vc_material(name, rough, two_sided=False, spec=0.25):
    path = ROOT + "/Materials/" + name
    fresh(path)
    m = tools.create_asset(name, ROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("two_sided", two_sided)
    vc = mel.create_material_expression(m, unreal.MaterialExpressionVertexColor, -500, 0)
    mel.connect_material_property(vc, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const1(m, rough, -500, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const1(m, spec, -500, 300), "", unreal.MaterialProperty.MP_SPECULAR)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def solid(name, rgb, rough, metal):
    path = ROOT + "/Materials/" + name
    fresh(path)
    m = tools.create_asset(name, ROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -500, 0)
    c.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const1(m, rough, -500, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const1(m, metal, -500, 300), "", unreal.MaterialProperty.MP_METALLIC)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def glowing(name, rgb, strength):
    path = ROOT + "/Materials/" + name
    fresh(path)
    m = tools.create_asset(name, ROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -700, 0)
    c.set_editor_property("constant", unreal.LinearColor(rgb[0] * strength, rgb[1] * strength, rgb[2] * strength, 1.0))
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


def part(name):
    return unreal.load_asset("%s/Parts/%s/%s/StaticMeshes/%s.%s" % (ROOT, name, name, name, name))


def spawn(name, mat, cast=True):
    a = actors.spawn_actor_from_object(part(name), V(0, 0, 0), R())
    c = a.static_mesh_component
    c.set_mobility(unreal.ComponentMobility.MOVABLE)
    c.set_material(0, mat)
    c.set_editor_property("cast_shadow", cast)
    a.set_actor_label(name)
    return a


def point(pos, rgb, intensity, radius, label):
    a = actors.spawn_actor_from_class(unreal.PointLight, ue(pos), R())
    c = a.point_light_component
    c.set_editor_property("light_color", unreal.Color(int(rgb[2] * 255), int(rgb[1] * 255), int(rgb[0] * 255), 255))
    c.set_editor_property("intensity", intensity)
    c.set_editor_property("attenuation_radius", radius)
    c.set_editor_property("cast_shadows", False)
    a.set_actor_label(label)


def build(map_path, proxies):
    if eal.does_asset_exist(map_path):  # new_level won't replace a map, so clear the existing one
        levels.load_level(map_path)
        actors.destroy_actors(actors.get_all_level_actors())
    else:
        levels.new_level(map_path)
    spawn("land_near", MATS["land"])
    spawn("land_far", MATS["land"], cast=False)
    spawn("trees", MATS["trees"])
    kit = {}
    for it in PLACED["items"]:
        small = it["name"].startswith(("Flower", "Grass", "Plant"))
        if (not proxies and small) or it["name"] not in KIT:
            continue  # the reflection map doesn't need thousands of tufts
        mesh = kit.setdefault(it["name"], unreal.load_asset(KIT[it["name"]]))
        a = actors.spawn_actor_from_object(mesh, V(it["x"] * 100, -it["y"] * 100, it["z"] * 100), R(yaw=it["yaw"]))
        a.set_actor_scale3d(V(it["scale"], it["scale"], it["scale"]))
        c = a.static_mesh_component
        c.set_mobility(unreal.ComponentMobility.MOVABLE)
        if small:
            c.set_editor_property("cast_shadow", False)
    # The live platform, hologram and portals are composited over this plate, so nothing stands in their place.

    # Soft high daylight over the viewer's left shoulder, as in the pack's preview.
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, V(0, 0, 3000), R(pitch=-50, yaw=-60))
    sc = sun.light_component
    sc.set_editor_property("intensity", 3.0)
    sc.set_editor_property("light_color", unreal.Color(226, 243, 255, 255))
    sc.set_editor_property("atmosphere_sun_light", True)
    sc.set_editor_property("light_source_angle", 1.0)
    sc.set_editor_property("volumetric_scattering_intensity", 1.2)
    sc.set_mobility(unreal.ComponentMobility.MOVABLE)
    sun.set_actor_label("Sun")
    sky = actors.spawn_actor_from_class(unreal.SkyAtmosphere, V(0, 0, 0), R())
    sky.set_actor_label("Sky")
    k = sky.get_component_by_class(unreal.SkyAtmosphereComponent)
    k.set_editor_property("aerial_pespective_view_distance_scale", 2.2)
    k.set_editor_property("multi_scattering_factor", 2.0)
    cloud = actors.spawn_actor_from_class(unreal.VolumetricCloud, V(0, 0, 0), R())
    cloud.set_actor_label("Clouds")
    light = actors.spawn_actor_from_class(unreal.SkyLight, V(0, 0, 500), R())
    lc = light.light_component
    lc.set_editor_property("real_time_capture", True)
    lc.set_editor_property("intensity", 3.0)
    lc.set_mobility(unreal.ComponentMobility.MOVABLE)
    light.set_actor_label("SkyLight")
    fog = actors.spawn_actor_from_class(unreal.ExponentialHeightFog, V(0, 0, 0), R())
    f = fog.component
    f.set_editor_property("fog_density", 0.001)
    f.set_editor_property("fog_height_falloff", 0.12)
    f.set_editor_property("enable_volumetric_fog", False)
    f.set_editor_property("volumetric_fog_scattering_distribution", 0.75)
    fog.set_actor_label("Valley haze")
    ppv = actors.spawn_actor_from_class(unreal.PostProcessVolume, V(0, 0, 0), R())
    ppv.set_editor_property("unbound", True)
    ps = ppv.settings
    for key, val in {
        "override_auto_exposure_method": True, "auto_exposure_method": unreal.AutoExposureMethod.AEM_MANUAL,
        "override_auto_exposure_apply_physical_camera_exposure": True, "auto_exposure_apply_physical_camera_exposure": False,
        "override_auto_exposure_bias": True, "auto_exposure_bias": EXPOSURE,
        "override_bloom_intensity": True, "bloom_intensity": 0.35,
        "override_vignette_intensity": True, "vignette_intensity": 0.12,
        "override_motion_blur_amount": True, "motion_blur_amount": 0.0,
        "override_lens_flare_intensity": True, "lens_flare_intensity": 0.0,
        "override_scene_fringe_intensity": True, "scene_fringe_intensity": 0.0,
        "override_color_saturation": True, "color_saturation": unreal.Vector4(1.1, 1.1, 1.1, 1.0),
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


def sequence(path, shots):
    """shots: (label, focal, sensor, position in UE, pitch, yaw), one frame each."""
    fresh(path)
    folder, name = path.rsplit("/", 1)
    seq = tools.create_asset(name, folder, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    seq.set_display_rate(unreal.FrameRate(24, 1))
    seq.set_playback_start(0)
    seq.set_playback_end(len(shots))
    cut = seq.add_track(unreal.MovieSceneCameraCutTrack)
    for i, (label, focal, sensor, p, pitch, yaw) in enumerate(shots):
        cam = camera(label, focal, sensor)
        b = seq.add_possessable(cam)
        t = b.add_track(unreal.MovieScene3DTransformTrack)
        s = t.add_section()
        s.set_range(i, i + 1)
        ch = s.get_all_channels()
        for j, val in enumerate((p.x, p.y, p.z, 0.0, pitch, yaw, 1, 1, 1)):
            ch[j].add_key(unreal.FrameNumber(i), val)
        sec = cut.add_section()
        sec.set_range(i, i + 1)
        try:
            sec.set_camera_binding_id(unreal.MovieSceneSequenceExtensions.get_portable_binding_id(seq, seq, b))
        except Exception:
            sec.set_camera_binding_id(seq.get_binding_id(b))
    eal.save_loaded_asset(seq)
    levels.save_current_level()


EXPOSURE = 0.4
HERE = os.path.dirname(os.path.abspath(__file__))
PLACED = json.load(open(os.path.join(HERE, "placements.json"), encoding="utf8"))
KIT = json.load(open(os.path.join(HERE, "kit_meshes.json"), encoding="utf8"))
# Nanite's fallback meshes wrecked this scene, so every mesh renders at full detail.
sm_sub = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
for folder in (ROOT + "/Parts", ROOT + "/Kit"):
    for asset_path in eal.list_assets(folder, recursive=True, include_folder=False):
        asset = unreal.load_asset(asset_path.split(".")[0])
        if isinstance(asset, unreal.StaticMesh):
            ns = asset.get_editor_property("nanite_settings")
            if ns.enabled:
                ns.enabled = False
                sm_sub.set_nanite_settings(asset, ns, True)
                eal.save_loaded_asset(asset)

MATS = {
    "land": vc_material("M_Land", 0.92),
    "trees": vc_material("M_Trees", 0.85, two_sided=True),
    "arch": solid("M_Arch", (0.8, 0.77, 0.58), 0.9, 0.0),
    "proxy": solid("M_Proxy", (0.05, 0.05, 0.055), 0.55, 0.9),
}
for i, rgb in enumerate(TEAMS):
    MATS["screen_%d" % i] = glowing("M_Screen_%d" % i, rgb, 0.3)



# ---------- the Nature pack's own look: no metal, textures kept bright, as in its preview ----------
def textures_by_name():
    out = {}
    for asset_path in eal.list_assets(ROOT + "/Kit", recursive=True, include_folder=False):
        leaf = asset_path.split("/")[-1].split(".")[0]
        if ("Leaves" in leaf or "Bark" in leaf or leaf in ("Grass", "Flowers", "Rocks", "T_Grass", "T_Flowers", "T_Rocks")) and not leaf.endswith("_Normal") and "BW" not in leaf:
            if leaf not in out:
                t = unreal.load_asset(asset_path.split(".")[0])
                if isinstance(t, unreal.Texture):
                    out[leaf] = t
    return out


def nature_material(key, texture, cutout, glow, tint=None):
    name = "M_Nature_" + key
    path = ROOT + "/Materials/" + name
    fresh(path)
    m = tools.create_asset(name, ROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("two_sided", cutout)
    if cutout:
        m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        m.set_editor_property("opacity_mask_clip_value", 0.35)
    tex = mel.create_material_expression(m, unreal.MaterialExpressionTextureSample, -800, 0)
    tex.set_editor_property("texture", texture)
    colour, pin = tex, "RGB"
    if tint:  # the pack's red and yellow leaves, regreened: those hues belong to the teams
        grey = mel.create_material_expression(m, unreal.MaterialExpressionDesaturation, -600, 100)
        mel.connect_material_expressions(tex, "RGB", grey, "")
        mel.connect_material_expressions(const1(m, 1.0, -800, 240), "", grey, "Fraction")
        tc = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -800, 320)
        tc.set_editor_property("constant", unreal.LinearColor(tint[0], tint[1], tint[2], 1.0))
        colour = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -500, 160)
        mel.connect_material_expressions(grey, "", colour, "A")
        mel.connect_material_expressions(tc, "", colour, "B")
        pin = ""
    mel.connect_material_property(colour, pin, unreal.MaterialProperty.MP_BASE_COLOR)
    if cutout:
        mel.connect_material_property(tex, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    e = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -400, 200)
    mel.connect_material_expressions(colour, pin, e, "A")
    mel.connect_material_expressions(const1(m, glow, -700, 320), "", e, "B")
    mel.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.connect_material_property(const1(m, 0.9, -400, 400), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const1(m, 0.0, -400, 480), "", unreal.MaterialProperty.MP_METALLIC)
    mel.connect_material_property(const1(m, 0.2, -400, 560), "", unreal.MaterialProperty.MP_SPECULAR)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return m


TEX = textures_by_name()
unreal.log("NATURE textures " + ", ".join(sorted(TEX)))
NATURE = {}
TINTS = {"MapleTree_Leaves": (0.62, 1.25, 0.36), "BirchTree_Leaves": (0.46, 0.76, 0.26), "Bush_Leaves": (0.42, 0.68, 0.26), "PineTree_Leaves": (0.3, 0.52, 0.24)}
GLOW = {"Bush_Leaves": 0.12, "Grass": 0.18}
for key in ("BirchTree_Leaves", "MapleTree_Leaves", "NormalTree_Leaves", "PineTree_Leaves", "Bush_Leaves", "Flowers", "Grass", "BirchTree_Bark", "MapleTree_Bark", "NormalTree_Bark", "PineTree_Bark", "Rocks"):
    found = next((t for n, t in TEX.items() if key in n), None)
    if not found:
        unreal.log_warning("NATURE no texture for " + key)
        continue
    cutout = "Bark" not in key and key != "Rocks"
    NATURE[key] = nature_material(key, found, cutout, GLOW.get(key, 0.3 if cutout else 0.2), TINTS.get(key))
ALIASES = {"Rock": "Rocks"}
swapped = 0
for name, mesh_path in KIT.items():
    if not name.startswith(("Birch", "Maple", "Normal", "Pine", "Dead", "Bush", "Flower", "Grass", "Plant", "Rock")):
        continue
    mesh = unreal.load_asset(mesh_path)
    for i, slot in enumerate(mesh.get_editor_property("static_materials")):
        slot_name = str(slot.get_editor_property("material_slot_name"))
        key = next((k for k in NATURE if k in slot_name), ALIASES.get(slot_name))
        if key in NATURE:
            mesh.set_material(i, NATURE[key])
            swapped += 1
    eal.save_loaded_asset(mesh)
unreal.log("NATURE swapped %d slots" % swapped)

d = (CAM_LOOK[0] - CAM_POS[0], CAM_LOOK[2] - CAM_POS[2], CAM_LOOK[1] - CAM_POS[1])
yaw = math.degrees(math.atan2(d[1], d[0]))
pitch = math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))

build(ROOT + "/Maps/MC_Land", True)
sequence(ROOT + "/Seq_Land", [("Cam_Plate", FOCAL, (SENSOR_W, SENSOR_H), ue(CAM_POS), pitch, yaw)])
# Same lens and aim on a bigger sensor, so the middle of each is the plate, for ultrawide windows and phones.
sequence(ROOT + "/Seq_LandWide", [("Cam_Wide", FOCAL, (SENSOR_W * 1.5, SENSOR_H), ue(CAM_POS), pitch, yaw)])
sequence(ROOT + "/Seq_LandTall", [("Cam_Tall", FOCAL, (SENSOR_W, SENSOR_H * 10 / 3), ue(CAM_POS), pitch, yaw)])

build(ROOT + "/Maps/MC_LandEnv", False)
eye = ue((0.0, 2.2, 0.0))
faces = [("px", 0, 0), ("nx", 0, 180), ("py", 90, 0), ("ny", -90, 0), ("pz", 0, 90), ("nz", 0, -90)]
sequence(ROOT + "/Seq_LandEnv", [("Cam_" + n, 18.0, (36.0, 36.0), eye, p, y) for n, p, y in faces])
unreal.log("MC BUILD OK pitch %.2f yaw %.2f" % (pitch, yaw))
