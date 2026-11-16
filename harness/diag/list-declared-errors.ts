import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
import type { SimpleRouteJson } from "lib/types"

const input: SimpleRouteJson = JSON.parse(
  gunzipSync(
    new Uint8Array(
      readFileSync("tests/fixtures/assets/a13-fixed-copper/remaining64.srj.json.gz"),
    ),
  ).toString("utf8"),
)
const started = performance.now()
const solver = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, {
  cacheProvider: null,
})
solver.solve()
const routedTraces = solver.getOutputSimplifiedPcbTraces()
console.log(
  `LIST solved=${solver.solved} traces=${routedTraces.length} seconds=${((performance.now() - started) / 1000).toFixed(1)}`,
)
let wire = 0
let vias = 0
for (const trace of routedTraces) {
  for (let i = 0; i < trace.route.length; i++) {
    const point = trace.route[i]!
    if (point.route_type === "via") vias++
    const next = trace.route[i + 1]
    if (point.route_type === "wire" && next?.route_type === "wire" && point.layer === next.layer) {
      wire += Math.hypot(next.x - point.x, next.y - point.y)
    }
  }
}
console.log(`LIST wire=${wire.toFixed(2)} vias=${vias}`)
for (const [label, drcOptions] of [
  ["declared", { traceClearance: input.minTraceToPadEdgeClearance }],
  ["relaxed", undefined],
] as const) {
  const { errorsWithCenters } = evaluateRelaxedDrc({
    inputSrj: input,
    srjWithPointPairs: solver.srjWithPointPairs!,
    routedTraces,
    drcOptions,
  })
  console.log(`LIST ${label} total=${errorsWithCenters.length}`)
  for (const error of errorsWithCenters) {
    console.log(
      `LIST ${label} ${error.type} @(${error.center?.x.toFixed(2)},${error.center?.y.toFixed(2)}) ${error.message}`,
    )
  }
}
