"""Usage: python tdrun.py script.py [timeout]. Hands a script to the running TouchDesigner and prints what it reported."""
import os, sys, time
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out.txt")
src = open(sys.argv[1], encoding="utf8").read()
timeout = float(sys.argv[2]) if len(sys.argv) > 2 else 60
start = os.path.getsize(OUT)
tmp = os.path.join(ROOT, "cmd.tmp")
open(tmp, "w", encoding="utf8").write(src)
os.replace(tmp, os.path.join(ROOT, "cmd.py"))
end = time.time() + timeout
while time.time() < end:
    time.sleep(0.25)
    with open(OUT, encoding="utf8") as f:
        f.seek(start)
        text = f.read()
    if "<<done>>" in text:
        print(text.replace("<<done>>", "").strip().encode("ascii", "replace").decode())
        sys.exit(0)
print("timed out")
sys.exit(1)
