// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// The H616 full-board test's DRC, broken down by type, with timing and stage stats.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"

const fixture = JSON.parse(gunzipSync(readFileSync("tests/fixtures/assets/h616-full-board-ddr-clearance.json.gz")).toString("utf8"))
const started = performance.now()
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(fixture.inputSrj, { cacheProvider: null })
solver.solve()
const referenceSrj = { ...fixture.inputSrj, obstacles: fixture.nativeObstacles, connections: [...fixture.preloadedConnections, ...fixture.inputSrj.connections], traces: fixture.preloadedTraces }
const result = evaluateRelaxedDrc({
  inputSrj: referenceSrj,
  srjWithPointPairs: { ...solver.srjWithPointPairs, connections: [...fixture.preloadedConnections, ...solver.srjWithPointPairs.connections] },
  routedTraces: solver.getOutputSimplifiedPcbTraces(),
  drcOptions: { traceClearance: 0.1, viaToPadClearance: 0.1 },
})
const counts: Record<string, number> = {}
for (const e of result.errors) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log(`H616 ${process.argv[2]} solved=${solver.solved} seconds=${((performance.now() - started) / 1000).toFixed(1)} errors=${result.errors.length} ${JSON.stringify(counts)}`)
console.log(`H616 ${process.argv[2]} times=${JSON.stringify(Object.fromEntries(Object.entries(solver.timeSpentOnPhase ?? {}).map(([k, v]: any) => [k, Math.round(v / 1000)]).filter(([, v]) => v > 0)))}`)
const joint = solver.pipeline9JointDrcRepairSolver?.stats ?? {}
console.log(`H616 ${process.argv[2]} joint initial=${joint.initialJointDrcIssueCount} final=${joint.finalDrcIssueCount} hd=${JSON.stringify(solver.highDensityRouteSolver?.stats ?? {}).slice(0, 300)}`)
