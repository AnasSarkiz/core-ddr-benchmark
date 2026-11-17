// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout that
// has the #203 fixtures. Routes Core's captured H3 byte 0 request, then byte 1
// as its own phase, validates both and counts later terminals left without access.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { validateOriginalEndpointConnectivity, validateRoutedCopperDrc } from "@tscircuit/fanout-solver"
import { BusLanesPipelineSolver } from "./lib"
import { getPadEscape } from "./tests/fixtures/pad-escapes"

const label = process.argv[2]!
const byte0Request = JSON.parse(gunzipSync(readFileSync(process.argv[3]!)).toString("utf8"))
const fixture = JSON.parse(gunzipSync(readFileSync("tests/fixtures/h3-pending-pad-escapes/input.json.gz")).toString("utf8"))
const route = (name: string, request: any): any[] => {
  const started = performance.now()
  const solver = new BusLanesPipelineSolver(structuredClone(request))
  solver.solve()
  console.log(`STEP ${label} ${name} solved=${solver.solved} error=${String(solver.error).slice(0, 160)} seconds=${((performance.now() - started) / 1000).toFixed(1)} stats=${JSON.stringify(Object.fromEntries(Object.entries(solver.stats as any).filter(([k]) => /Stranded|planned/i.test(k))))}`)
  if (!solver.solved) throw new Error(`${name} failed`)
  return solver.getOutput().traces.slice(request.traces?.length ?? 0)
}
const byte0 = route("byte0", byte0Request)
const byte1Request = { ...fixture.byte1Request, traces: byte0 }
const byte1 = route("byte1", byte1Request)
const traces = [...byte0, ...byte1]
const base = { ...byte0Request, traces: [] }
const connections = [...byte0Request.connections, ...fixture.byte1Request.connections]
const inputSrj = { ...base, connections, obstacles: base.obstacles.map((o: any) => ({ ...o, type: "rect" })) }
const context = { inputSrj, routedSrj: { ...inputSrj, traces } }
const connectivity = validateOriginalEndpointConnectivity(context as any)
const drc = validateRoutedCopperDrc({ ...(context as any), clearance: base.minTraceToPadEdgeClearance, allowBlindAndBuriedVias: false })
const pads = (request: any): Map<string, string | null> =>
  new Map(fixture.pendingConnections.flatMap((connection: any) =>
    connection.pointsToConnect.map((point: any, end: number) => [point.pcb_port_id, getPadEscape({ input: request, connection, end, viaTargetLayer: "bottom" })]),
  ))
const before = pads(base)
const after = pads({ ...base, traces })
const lost = [...after].filter(([port, escape]) => before.get(port) && !escape).map(([port]) => port)
let vias = 0, wire = 0
for (const t of traces) for (let i = 0; i < t.route.length; i++) {
  const p = t.route[i], q = t.route[i + 1]
  if (p.route_type === "via") vias++
  if (q && p.route_type === "wire" && q.route_type === "wire" && p.layer === q.layer) wire += Math.hypot(q.x - p.x, q.y - p.y)
}
console.log(`RESULT ${label} traces=${traces.length} connected=${connectivity.connectedConnectionCount}/${connections.length} valid=${connectivity.valid} drc=${drc.valid} wire=${wire.toFixed(1)} vias=${vias} trapped=${lost.length} ${lost.join(",")}`)
writeFileSync(`/tmp/bytes-${label}.json`, JSON.stringify(traces))
