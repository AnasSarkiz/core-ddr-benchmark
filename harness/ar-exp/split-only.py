# Experiment only: restrict the node split to the ids in SPLIT_ONLY.
from pathlib import Path
p = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/splitNodesWithoutViaSite.ts")
t = p.read_text()
old = "    if (hasViaSite) return [node]\n"
assert t.count(old) == 1
t = t.replace(old, '    if (hasViaSite) return [node]\n    if (process.env.SPLIT_ONLY && !process.env.SPLIT_ONLY.split(",").includes(node.capacityMeshNodeId)) return [node]\n')
p.write_text(t)
print("split-only applied")
