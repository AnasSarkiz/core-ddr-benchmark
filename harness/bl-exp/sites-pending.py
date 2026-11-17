# Experiment only: signal-site negotiation scores a candidate also by how many
# pending pads' exit guides its copper blocks. Guides come from the existing
# pendingPackageExits, computed once from the pipeline's routing input.
import os
from pathlib import Path
p = Path("lib/bus-lanes-pipeline-solver.ts")
t = p.read_text()
if os.environ.get("SURFACE_FIRST"):
    t = t.replace("    if (!hasTimingConstraints) surfaceRoutingAttempt = 1\n", "").replace(
        "    const needsSharedSurfaceRouting = buses.length > 1 || hasMaxBusLength\n",
        "    const needsSharedSurfaceRouting = true\n")
old4 = "    this.routingInput = routingInput\n"
assert t.count(old4) == 1
t = t.replace(old4, old4 + '''    {
      const exits = pendingPackageExits(routingInput, expFixedCopper(routingInput))
      let step = exits.next()
      while (!step.done) step = exits.next()
      const groups = new Map<string, any[]>()
      for (const c of step.value as any[]) {
        const key = c.owners.join("|")
        groups.set(key, [...(groups.get(key) ?? []), c])
      }
      ;(globalThis as any).__pendingGroups = [...groups.values()]
      console.log(`EXP pending exit guides=${step.value.length} pads/groups=${groups.size}`)
    }
''')
t = 'import { pendingPackageExits } from "./pending-lane-certificates"\nimport { fixedCopper as expFixedCopper } from "./vector-scene"\n' + t
p.write_text(t)
q = Path("lib/negotiate-signal-sites.ts")
s = q.read_text()
old = "            score = length(trace.route) + escapeLength + hits.length * 100\n"
assert s.count(old) == 1
s = s.replace(old, '''            pendingHits = (((globalThis as any).__pendingGroups ?? []) as any[]).filter((group) => overlap(copper, group)).length,
            score = length(trace.route) + escapeLength + hits.length * 100 + pendingHits * 100
''')
q.write_text(s)
print("applied sites-pending", "surface-first" if os.environ.get("SURFACE_FIRST") else "")
