// Diagnostic only; never part of a PR. Run from a Core checkout. Rebuilds H3's
// remaining-phase request around supplied byte copper the way Core does, then
// routes it with the installed capacity autorouter.
import { readFileSync } from "node:fs"
import { withFixedTraces } from "lib/utils/autorouting/with-fixed-traces"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "@tscircuit/capacity-autorouter"

const remaining = JSON.parse(readFileSync(process.argv[2]!, "utf8"))
const traces = JSON.parse(readFileSync(process.argv[3]!, "utf8"))
const label = process.argv[4]
const pads = remaining.obstacles.filter((o: any) => o.componentId)
const input = withFixedTraces({ ...remaining, obstacles: pads, traces }, new Set(traces.map((t: any) => t.pcb_trace_id)))
const request = { ...input, traces: [] }
console.log(`REMAINING ${label} obstacles=${request.obstacles.length} connections=${request.connections.length}`)
const started = performance.now()
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(request, { cacheProvider: null } as any)
try {
  solver.solve()
} catch (error) {
  console.log(`REMAINING ${label} threw ${String(error).slice(0, 300)}`)
}
console.log(`REMAINING ${label} solved=${solver.solved} failed=${solver.failed} seconds=${((performance.now() - started) / 1000).toFixed(1)} error=${String(solver.error).slice(0, 300)}`)
if (solver.solved) console.log(`REMAINING ${label} routed=${solver.getOutputSimplifiedPcbTraces().length}`)
