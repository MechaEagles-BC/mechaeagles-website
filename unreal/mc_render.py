"""Renders the room plate or the reflection faces with Movie Render Queue, then quits.
Run with -ExecCmds, not -ExecutePythonScript, which quits as soon as the script returns: UnrealEditor.exe HangarIgnition.uproject -ExecCmds="py mc_render.py plate test" -nop4 """
import sys
import unreal

WHAT = sys.argv[1] if len(sys.argv) > 1 else "plate"
MODE = sys.argv[2] if len(sys.argv) > 2 else "test"
OUT = r"C:\Users\vedar\MechaEagles-lab\foundation-r3f\unreal\render\%s_%s" % (WHAT, MODE)
if WHAT == "plate":
    MAP, SEQ, SIZE = "MC_Land", "Seq_Land", (2400, 1800) if MODE == "final" else (1200, 900)
elif WHAT == "wide":
    MAP, SEQ, SIZE = "MC_Land", "Seq_LandWide", (2400, 1200)
elif WHAT == "tall":
    MAP, SEQ, SIZE = "MC_Land", "Seq_LandTall", (1200, 3000)
elif WHAT == "space":
    MAP, SEQ, SIZE = "MC_Space", "Seq_Space", (2400, 1800) if MODE == "final" else (1200, 900)
elif WHAT == "space-wide":
    MAP, SEQ, SIZE = "MC_Space", "Seq_SpaceWide", (2400, 1200)
elif WHAT == "space-tall":
    MAP, SEQ, SIZE = "MC_Space", "Seq_SpaceTall", (1200, 3000)
else:
    MAP, SEQ, SIZE = "MC_LandEnv", "Seq_LandEnv", (512, 512)

subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
queue.delete_all_jobs()
job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.map = unreal.SoftObjectPath("/Game/MissionControl/Maps/%s.%s" % (MAP, MAP))
job.sequence = unreal.SoftObjectPath("/Game/MissionControl/%s.%s" % (SEQ, SEQ))
job.job_name = WHAT + "_" + MODE
cfg = job.get_configuration()
out = cfg.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
out.output_directory = unreal.DirectoryPath(OUT)
out.output_resolution = unreal.IntPoint(*SIZE)
out.file_name_format = "{frame_number}"
out.zero_pad_frame_numbers = 2
cfg.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPassBase)
cfg.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_PNG)
aa = cfg.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.override_anti_aliasing = True
aa.anti_aliasing_method = unreal.AntiAliasingMethod.AAM_NONE
aa.spatial_sample_count = 1
aa.temporal_sample_count = 16 if MODE == "final" else 4
aa.engine_warm_up_count = 48
aa.render_warm_up_count = 48
aa.use_camera_cut_for_warm_up = True
cvars = cfg.find_or_add_setting_by_class(unreal.MoviePipelineConsoleVariableSetting)
for k, v in {"r.VolumetricFog.GridPixelSize": 4, "r.VolumetricFog.GridSizeZ": 128, "r.Lumen.Reflections.DownsampleFactor": 1}.items():
    cvars.add_or_update_console_variable(k, v)

executor = unreal.MoviePipelinePIEExecutor()


def done(exe, ok):
    unreal.log("MC RENDER DONE ok=%s -> %s" % (ok, OUT))
    unreal.SystemLibrary.quit_editor()


executor.on_executor_finished_delegate.add_callable_unique(done)
ticks = {"n": 0}


def tick(dt):  # PIE started before the editor settles ends at once
    ticks["n"] += 1
    if ticks["n"] == 150:
        unreal.unregister_slate_post_tick_callback(handle)
        unreal.log("MC RENDER START %s %dx%d" % (WHAT, SIZE[0], SIZE[1]))
        subsystem.render_queue_with_executor_instance(executor)


handle = unreal.register_slate_post_tick_callback(tick)
