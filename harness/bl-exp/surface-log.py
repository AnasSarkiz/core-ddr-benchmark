# Experiment only: surface-first with logging of the shared-surface outcome.
from pathlib import Path
p = Path("lib/bus-lanes-pipeline-solver.ts")
t = p.read_text()
old1 = "    if (!hasTimingConstraints) surfaceRoutingAttempt = 1\n"
old2 = "    const needsSharedSurfaceRouting = buses.length > 1 || hasMaxBusLength\n"
t = t.replace(old1, "").replace(old2, "    const needsSharedSurfaceRouting = true\n")
old3 = '        if (!state.value) throw Error("Shared-layer bus routing exhausted")\n'
assert t.count(old3) == 1
t = t.replace(old3, '        console.log(`EXP shared-surface result=${state.value ? state.value.traces.length + " traces" : "null"} attempt=${this.attempt}`)\n' + old3)
p.write_text(t)
print("applied surface-log")
