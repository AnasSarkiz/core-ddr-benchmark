import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
import type { SimpleRouteJson } from "lib/types"

const label = process.argv[2]
const input: SimpleRouteJson = JSON.parse(
  gunzipSync(new Uint8Array(readFileSync("tests/fixtures/assets/a13-via-without-site/remaining64.srj.json.gz"))).toString("utf8"),
)
const started = Date.now()
const solver = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
solver.solve()
if (!solver.solved) { console.log(`A13VIA ${label} FAILED error=${String((solver as any).error).slice(0, 900)}`); const hd: any = (solver as any).highDensityRouteSolver; console.log(`A13VIA ${label} hdStats=${JSON.stringify(hd?.stats ?? {}).slice(0, 900)}`); process.exit(0) }
const routedTraces = solver.getOutputSimplifiedPcbTraces()
const solveSeconds = ((Date.now() - started) / 1000).toFixed(1)
const { errors, errorsWithCenters } = evaluateRelaxedDrc({
  inputSrj: input,
  srjWithPointPairs: solver.srjWithPointPairs!,
  routedTraces,
  drcOptions: { traceClearance: input.minTraceToPadEdgeClearance },
}) as any
const viaPad = errorsWithCenters.filter((e: any) => e.type === "pcb_pad_pad_clearance_error" && e.message.startsWith("Via"))
const frame = { minX: -9.04, maxX: -4.04, minY: -3.74, maxY: 0.26 }
const inFrame = viaPad.filter((e: any) => e.center.x >= frame.minX && e.center.x <= frame.maxX && e.center.y >= frame.minY && e.center.y <= frame.maxY)
let vias = 0
for (const t of routedTraces) for (const p of t.route as any[]) if (p.route_type === "via") vias++
console.log(`A13VIA ${label} solved=${solver.solved} traces=${routedTraces.length} solveSeconds=${solveSeconds} relaxedDrc=${errors.length} viaPad=${viaPad.length} frame=${inFrame.length} vias=${vias}`)
for (const e of inFrame) console.log(`A13FRAME ${label} (${e.center.x.toFixed(2)},${e.center.y.toFixed(2)}) ${String(e.message).slice(0, 150)}`)
for (const e of viaPad) console.log(`A13VIAPAD ${label} (${e.center.x.toFixed(2)},${e.center.y.toFixed(2)}) ${String(e.message).slice(0, 150)}`)
