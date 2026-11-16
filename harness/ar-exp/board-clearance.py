"""Experiment: the bounded regional repair searches paths at the board's trace clearance."""
from pathlib import Path
p = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9BoundedRegionalRepairSolver.ts")
s = p.read_text()
old = "      traceClearance: RELAXED_DRC_OPTIONS.traceClearance,\n"
assert s.count(old) == 1
s = s.replace(old, "      traceClearance:\n        context.srj.minTraceToPadEdgeClearance ??\n        RELAXED_DRC_OPTIONS.traceClearance,\n")
p.write_text(s)
