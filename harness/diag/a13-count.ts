// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter repro branch checkout.
// A13 remaining phase: via-to-pad findings under the declared clearance and relaxed DRC totals.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
const input = JSON.parse(gunzipSync(readFileSync("tests/fixtures/assets/a13-via-without-site/remaining64.srj.json.gz")).toString("utf8"))
const started = performance.now()
const s: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
s.solve()
const routedTraces = s.getOutputSimplifiedPcbTraces()
const r: any = evaluateRelaxedDrc({ inputSrj: input, srjWithPointPairs: s.srjWithPointPairs, routedTraces, drcOptions: { traceClearance: input.minTraceToPadEdgeClearance } })
const viaPad = r.errorsWithCenters.filter((e: any) => e.type === "pcb_pad_pad_clearance_error" && e.message.startsWith("Via")).length
const counts: Record<string, number> = {}
for (const e of r.errors) counts[e.type] = (counts[e.type] ?? 0) + 1
const centers = r.errorsWithCenters.filter((e: any) => e.type === "pcb_pad_pad_clearance_error" && e.message.startsWith("Via")).map((e: any) => `(${e.center.x.toFixed(2)},${e.center.y.toFixed(2)})`).join(" ")
console.log(`A13 ${process.argv[2]} viaPadAt=${centers}`)
console.log(`A13 ${process.argv[2]} solved=${s.solved} traces=${routedTraces.length} seconds=${((performance.now() - started) / 1000).toFixed(1)} viaPad=${viaPad} errors=${r.errors.length} ${JSON.stringify(counts)}`)
