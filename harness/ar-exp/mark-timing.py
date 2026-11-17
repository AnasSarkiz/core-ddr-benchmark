# CI only: time the marking step and optionally mark nodes narrower than a via.
from pathlib import Path
p = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph.ts")
t = p.read_text()
old = "          cms.capacityNodes = markNodesWithoutViaSite({"
assert t.count(old) == 1
t = t.replace(old, "          const markStart = performance.now()\n" + old)
i = t.index(old); j = t.index("          })\n", i) + len("          })\n")
t = t[:j] + '          console.log(`MARKTIME ms=${(performance.now() - markStart).toFixed(1)} nodes=${cms.capacityNodes.length} marked=${cms.capacityNodes.filter((n) => n._lacksViaSite).length}`)\n' + t[j:]
p.write_text(t)
f = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/markNodesWithoutViaSite.ts")
u = f.read_text()
old = "    if (centers.minX > centers.maxX || centers.minY > centers.maxY)\n      return node\n"
assert old in u
u = u.replace(old, "    if (centers.minX > centers.maxX || centers.minY > centers.maxY)\n      return process.env.MARK_NARROW === \"1\" ? { ...node, _lacksViaSite: true } : node\n")
f.write_text(u)
print("mark-timing applied")
