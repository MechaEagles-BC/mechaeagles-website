def onFrameStart(frame):
	if "_bridge_tick" not in globals():
		exec(open(r"C:\Users\vedar\AppData\Local\Temp\claude\C--Users-vedar-OneDrive-Desktop-MechaEagles\7471bf68-56db-421c-b8bc-3b1bf0664bc9\scratchpad\td\bridge.py", encoding="utf8").read(), globals())
	_bridge_tick()
	return
