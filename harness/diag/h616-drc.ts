import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"

const label = process.argv[2]
const fixture = JSON.parse(
  gunzipSync(new Uint8Array(readFileSync("tests/fixtures/assets/h616-full-board-ddr-clearance.json.gz"))).toString("utf8"),
)
const solver = new AutoroutingPipelineSolver9_PreloadedTraceGraph(fixture.inputSrj, { cacheProvider: null })
solver.solve()
const referenceSrj = {
  ...fixture.inputSrj,
  obstacles: fixture.nativeObstacles,
  connections: [...fixture.preloadedConnections, ...fixture.inputSrj.connections],
  traces: fixture.preloadedTraces,
}
const errors = evaluateRelaxedDrc({
  inputSrj: referenceSrj,
  srjWithPointPairs: {
    ...solver.srjWithPointPairs!,
    connections: [...fixture.preloadedConnections, ...solver.srjWithPointPairs!.connections],
  },
  routedTraces: solver.getOutputSimplifiedPcbTraces(),
  drcOptions: { traceClearance: 0.1, viaToPadClearance: 0.1 },
}).errors as any[]
console.log(`H616SUM ${label} errors=${errors.length} contacts=${errors.filter((e) => typeof e.actual_clearance === "number" && e.actual_clearance < 0).length}`)
for (const e of errors) {
  const c = typeof e.actual_clearance === "number" ? e.actual_clearance.toFixed(3) : "-"
  console.log(`H616ERR ${label} ${e.type} clr=${c} ${String(e.message ?? "").slice(0, 160)}`)
}
