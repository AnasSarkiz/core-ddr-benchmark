// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout that
// has the #203 fixtures. Routes H3 byte 1 and counts later terminals that lose access.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { BusLanesPipelineSolver } from "./lib"
import { getPadEscape } from "./tests/fixtures/pad-escapes"
import { checkEachPcbTraceNonOverlapping } from "@tscircuit/checks"

const fixture = JSON.parse(gunzipSync(readFileSync("tests/fixtures/h3-pending-pad-escapes/input.json.gz")).toString("utf8"))
const input = fixture.byte1Request
const pendingPads = (request: any): Map<string, string | null> =>
  new Map(
    fixture.pendingConnections.flatMap((connection: any) =>
      connection.pointsToConnect.map((point: any, end: number) => [
        point.pcb_port_id,
        getPadEscape({ input: request, connection, end, viaTargetLayer: "bottom" }),
      ]),
    ),
  )
const started = performance.now()
const solver = new BusLanesPipelineSolver(structuredClone(input))
solver.solve()
const seconds = ((performance.now() - started) / 1000).toFixed(1)
console.log(`RESULT solved=${solver.solved} failed=${solver.failed} error=${String(solver.error).slice(0, 300)} seconds=${seconds}`)
if (solver.solved) {
  const traces = solver.getOutput().traces
  const routed = traces.slice(8)
  let wire = 0
  let vias = 0
  for (const trace of routed) {
    for (let i = 0; i < trace.route.length; i++) {
      const p: any = trace.route[i]
      const q: any = trace.route[i + 1]
      if (p.route_type === "via") vias++
      if (q && p.route_type === "wire" && q.route_type === "wire" && p.layer === q.layer) wire += Math.hypot(q.x - p.x, q.y - p.y)
    }
  }
  console.log(`ROUTES total=${traces.length} byte1Wire=${wire.toFixed(2)} byte1Vias=${vias}`)
  for (const trace of routed) {
    let len = 0
    const layers = new Set<string>()
    for (let i = 0; i + 1 < trace.route.length; i++) {
      const p: any = trace.route[i], q: any = trace.route[i + 1]
      if (p.route_type === "wire") layers.add(p.layer)
      if (p.route_type === "wire" && q.route_type === "wire" && p.layer === q.layer) len += Math.hypot(q.x - p.x, q.y - p.y)
    }
    console.log(`ROUTE ${(trace as any).connection_name ?? (trace as any).pcb_trace_id} len=${len.toFixed(2)} vias=${trace.route.filter((p: any) => p.route_type === "via").length} layers=${[...layers].join("+")}`)
  }
  const before = pendingPads(input)
  const after = pendingPads({ ...input, traces })
  const trapped = [...after].filter(([port, escape]) => before.get(port) && !escape).map(([port]) => port)
  console.log(`TRAPPED ${trapped.length} ${trapped.join(",")}`)
}
