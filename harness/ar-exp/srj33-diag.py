from pathlib import Path
p = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9RegionalB01RepairSolver.ts")
t = p.read_text()
old = """  private finishRepair(): void {
    this.activeSubSolver = null
"""
assert t.count(old) == 1
t = t.replace(old, old + """    if (this.shortFreeRoutes !== this.currentRoutes) {
      const describe = (errors: Pipeline9DrcError[]) =>
        errors
          .filter((e) => e.type === "pcb_trace_error" && typeof e.actual_clearance === "number" && (e.actual_clearance as number) < 0)
          .map((e) => JSON.stringify({ id: e.pcb_trace_error_id, t: e.pcb_trace_id, ts: e.pcb_trace_ids, pad: e.pcb_smtpad_id ?? e.pcb_plated_hole_id, gap: e.actual_clearance }))
      console.log(`SRJ33DIAG final=${this.currentErrors.length} shortFree=${this.shortFreeErrors.length} input=${this.inputErrors.length}`)
      console.log(`SRJ33DIAG input contacts: ${describe(this.inputErrors).join(" ; ")}`)
      console.log(`SRJ33DIAG final contacts: ${describe(this.currentErrors).join(" ; ")}`)
    }
""")
p.write_text(t)
