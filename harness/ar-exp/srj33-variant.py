import sys
from pathlib import Path
variant = sys.argv[1]
p = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9RegionalB01RepairSolver.ts")
t = p.read_text()
def drop(old, new):
    global t
    assert t.count(old) == 1, old
    t = t.replace(old, new)
if variant in ("no-final-selection", "refine-only"):
    drop("""        isPipeline9DrcCandidateBetter(cleanup.errors, this.bestErrors, {
          rejectNewContacts: true,
        })""", """        isPipeline9DrcCandidateBetter(cleanup.errors, this.bestErrors)""")
if variant == "refine-only":
    drop("""      isPipeline9DrcCandidateBetter(errors, cleanup.errors, {
        rejectNewContacts: true,
      }) &&
      !this.introducesViaInPad(routes)""", """      isPipeline9DrcCandidateBetter(errors, cleanup.errors) &&
      !this.introducesViaInPad(routes)""")
    drop("    if (!introducesPipeline9DrcContact(errors, cleanup.errors)) {", "    if (true) {")
p.write_text(t)
