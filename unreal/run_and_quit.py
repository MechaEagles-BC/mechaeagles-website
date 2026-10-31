"""Runs another script inside a full editor session, then quits."""
import os, sys, traceback, unreal
target = os.path.join(os.path.dirname(os.path.abspath(__file__)), sys.argv[1])
try:
    exec(compile(open(target, encoding="utf8").read(), target, "exec"), {"__name__": "__main__", "__file__": target})
except Exception:
    unreal.log_error("SCRIPT FAILED\n" + traceback.format_exc())
unreal.SystemLibrary.quit_editor()
