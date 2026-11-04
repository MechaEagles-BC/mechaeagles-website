# Runs inside TouchDesigner. Watches for scripts from outside, runs each one, and writes down what happened, so scenes can be built without clicking.
import os, traceback, io, contextlib

ROOT = r"C:\Users\vedar\AppData\Local\Temp\claude\C--Users-vedar-OneDrive-Desktop-MechaEagles\7471bf68-56db-421c-b8bc-3b1bf0664bc9\scratchpad\td"
CMD = os.path.join(ROOT, "cmd.py")
OUT = os.path.join(ROOT, "out.txt")


def _bridge_tick():
    if not os.path.exists(CMD):
        return
    src = open(CMD, encoding="utf8").read()
    os.remove(CMD)
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(src, globals())
    except Exception:
        buf.write("\nERROR\n" + traceback.format_exc())
    with open(OUT, "a", encoding="utf8") as f:
        f.write(buf.getvalue() + "\n<<done>>\n")


with open(OUT, "w", encoding="utf8") as f:
    f.write(f"bridge up, {app.version}.{app.build}\n<<done>>\n")
