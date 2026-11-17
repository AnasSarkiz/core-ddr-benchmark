from pathlib import Path
p = Path("lib/bus-lanes-pipeline-solver.ts")
t = p.read_text()
old1 = "    if (!hasTimingConstraints) surfaceRoutingAttempt = 1\n"
old2 = "    const needsSharedSurfaceRouting = buses.length > 1 || hasMaxBusLength\n"
assert t.count(old1) == 1 and t.count(old2) == 1
t = t.replace(old1, "").replace(old2, "    const needsSharedSurfaceRouting = true\n")
p.write_text(t)
print("applied surface-first")
