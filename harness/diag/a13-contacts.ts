// Diagnostic only; never part of a PR. Copper contacts on the native A13 remaining fixture.
import { checkEachPcbTraceNonOverlapping } from "@tscircuit/checks"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
const label = process.argv[2]
const input: any = JSON.parse(gunzipSync(new Uint8Array(readFileSync("tests/fixtures/assets/a13-fixed-copper/remaining64-bus060.srj.json.gz"))).toString("utf8"))
const s: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
s.solve()
const snap = { inputSrj: input, srjWithPointPairs: s.srjWithPointPairs, routedTraces: s.getOutputSimplifiedPcbTraces() }
const r: any = evaluateRelaxedDrc({ ...snap, drcOptions: { traceClearance: input.minTraceToPadEdgeClearance, viaToPadClearance: input.minViaEdgeToPadEdgeClearance } })
const contacts: any[] = checkEachPcbTraceNonOverlapping(evaluateRelaxedDrc(snap).circuitJson, { minClearance: 0 })
console.log(`CONTACT ${label} relaxed=${r.errors.length} contacts=${contacts.length} marked=${s.capacityNodes?.filter((n: any) => n._lacksViaSite).length}`)
for (const c of contacts) console.log(`CONTACT ${label}   ${c.error_type ?? c.type} ${JSON.stringify(c.center ?? c.pcb_center ?? "")} ${(c.message ?? "").slice(0, 200)}`)
