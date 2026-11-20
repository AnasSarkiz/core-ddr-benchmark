from pathlib import Path
p = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9RegionalB01RepairSolver.ts")
t = p.read_text()
old = """      isPipeline9DrcCandidateBetter(errors, cleanup.errors, {
        rejectNewContacts: true,
      }) &&
      !this.introducesViaInPad(routes)"""
assert t.count(old) == 1, t.count(old)
t = t.replace(old, """      isPipeline9DrcCandidateBetter(errors, cleanup.errors) &&
      !this.introducesViaInPad(routes)""")
p.write_text(t)
