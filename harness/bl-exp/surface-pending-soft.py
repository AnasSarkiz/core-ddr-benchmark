# Experiment only: surface-first, plus pending pad exit guides as soft copper in
# every surface search, plus logging of the shared-surface outcome.
from pathlib import Path
p = Path("lib/bus-lanes-pipeline-solver.ts")
t = p.read_text()
old1 = "    if (!hasTimingConstraints) surfaceRoutingAttempt = 1\n"
old2 = "    const needsSharedSurfaceRouting = buses.length > 1 || hasMaxBusLength\n"
assert t.count(old1) == 1 and t.count(old2) == 1
t = t.replace(old1, "").replace(old2, "    const needsSharedSurfaceRouting = true\n")
old3 = '        if (!state.value) throw Error("Shared-layer bus routing exhausted")\n'
assert t.count(old3) == 1
t = t.replace(old3, '        console.log(`EXP shared-surface result=${state.value ? state.value.traces.length + " traces" : "null"} attempt=${this.attempt}`)\n' + old3)
old4 = "    this.routingInput = routingInput\n"
assert t.count(old4) == 1
t = t.replace(old4, old4 + '''    {
      const exits = pendingPackageExits(routingInput, fixedCopper(routingInput))
      let step = exits.next()
      while (!step.done) step = exits.next()
      ;(globalThis as any).__pendingSoft = step.value.map((c: any, i: number) => ({
        pcb_trace_id: `pending_exit_${i}`,
        connection_name: c.owners[0],
        route: [
          { route_type: "wire", x: c.a.x, y: c.a.y, width: c.radius * 2, layer: c.layer },
          { route_type: "wire", x: c.b.x, y: c.b.y, width: c.radius * 2, layer: c.layer },
        ],
      }))
      console.log(`EXP pending exit guides=${step.value.length}`)
    }
''')
t = 'import { pendingPackageExits } from "./pending-lane-certificates"\nimport { fixedCopper as expFixedCopper } from "./vector-scene"\n' + t
t = t.replace("pendingPackageExits(routingInput, fixedCopper(routingInput))", "pendingPackageExits(routingInput, expFixedCopper(routingInput))")
p.write_text(t)

q = Path("lib/route-surface-bridge.ts")
s = q.read_text()
old5 = "  const softTraces = options.softTraces ?? [],\n"
assert s.count(old5) == 1
s = s.replace(old5, "  const softTraces = [...(options.softTraces ?? []), ...(((globalThis as any).__pendingSoft ?? []) as Trace[])],\n")
q.write_text(s)
print("applied surface-pending-soft")
