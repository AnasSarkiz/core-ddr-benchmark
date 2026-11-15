// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout:
//   bun <harness>/diag/diagnose.ts <fixture.json.gz> [goal]
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const { BusLanesPipelineSolver } = await import(resolve(process.cwd(), "lib/index.ts"))
const file = process.argv[2]
const goal = process.argv[3]
const { input } = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"))
const solver = new BusLanesPipelineSolver(input, goal ? { goal } : {})
const started = performance.now()
let last = ""
let steps = 0
const seconds = () => ((performance.now() - started) / 1000).toFixed(1)
console.log(`== ${file} goal=${goal ?? "default"} connections=${input.connections.length} supplied=${input.traces?.length ?? 0}`)
console.log("constructor phase:", solver.phase, "MAX_ITERATIONS", solver.MAX_ITERATIONS, "nativeGroupsActive", (solver as any).nativeGroupsActive, "routingInput.allowedLayers", (solver as any).routingInput.allowedLayers)
const describeEscapes = () => {
  const escapes = ((solver as any).escapes ?? []) as any[]
  const summary = escapes.map((t) => `${t.connection_name}:${t.route.map((p: any) => (p.route_type === "via" ? `VIA(${p.from_layer}>${p.to_layer})` : p.layer[0])).join("")}`)
  return `${escapes.length} escapes [${summary.join(" ")}]`
}
while (!solver.solved && !solver.failed && steps < 5_000_000) {
  solver.step()
  steps++
  if (solver.phase !== last) {
    last = solver.phase
    console.log(`t=${seconds()}s steps=${steps} iterations=${solver.iterations} phase=${solver.phase} attempt=${(solver as any).attempt} negotiable=${(solver as any).canNegotiateGeneratedSites} stats=${JSON.stringify(solver.stats).slice(0, 400)}`)
    if (/^lanes_|resolve|retry/.test(solver.phase)) console.log("   ", describeEscapes())
  }
}
console.log(`RESULT t=${seconds()}s solved=${solver.solved} failed=${solver.failed} error=${solver.error} failureCode=${(solver as any).failureCode} iterations=${solver.iterations}`)
if (solver.solved) {
  const traces = solver.traces as any[]
  for (const t of traces) {
    let length = 0
    const vias = t.route.filter((p: any) => p.route_type === "via").length
    const layers = new Set(t.route.filter((p: any) => p.route_type === "wire").map((p: any) => p.layer))
    for (let i = 1; i < t.route.length; i++) length += Math.hypot(t.route[i].x - t.route[i - 1].x, t.route[i].y - t.route[i - 1].y)
    console.log(`  ${t.connection_name} length=${length.toFixed(2)} vias=${vias} layers=${[...layers].join(",")}`)
  }
}
