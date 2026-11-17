// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout that
// has the #203 fixtures. Produces H3 byte copper for three phase strategies,
// validates it, counts later terminals left without access, and writes it out.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { validateOriginalEndpointConnectivity, validateRoutedCopperDrc } from "@tscircuit/fanout-solver"
import { BusLanesPipelineSolver } from "./lib"
import { getPadEscape } from "./tests/fixtures/pad-escapes"

const fixture = JSON.parse(gunzipSync(readFileSync("tests/fixtures/h3-pending-pad-escapes/input.json.gz")).toString("utf8"))
const byte1 = fixture.byte1Request
const byte0Connections = fixture.fixedConnections
const byte0Names: string[] = byte0Connections.map((c: any) => c.name)
const byte1Names: string[] = byte1.connections.map((c: any) => c.name)
const base = { ...byte1, traces: [] }
const bus = (id: string, names: string[]): any => ({ busId: id, name: id, connectionNames: names, allowedLayers: ["top", "bottom"] })
const route = (label: string, request: any): any[] => {
  const started = performance.now()
  const solver = new BusLanesPipelineSolver(structuredClone(request))
  solver.solve()
  console.log(`STEP ${label} solved=${solver.solved} error=${String(solver.error).slice(0, 160)} seconds=${((performance.now() - started) / 1000).toFixed(1)}`)
  if (!solver.solved) throw new Error(`${label} failed`)
  return solver.getOutput().traces
}
const report = (label: string, traces: any[]): void => {
  const connections = [...byte0Connections, ...byte1.connections]
  const inputSrj = { ...base, connections, obstacles: base.obstacles.map((o: any) => ({ ...o, type: "rect" })), traces: [] }
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
  let vias = 0
  let wire = 0
  for (const t of traces) for (let i = 0; i < t.route.length; i++) {
    const p = t.route[i], q = t.route[i + 1]
    if (p.route_type === "via") vias++
    if (q && p.route_type === "wire" && q.route_type === "wire" && p.layer === q.layer) wire += Math.hypot(q.x - p.x, q.y - p.y)
  }
  console.log(`RESULT ${label} traces=${traces.length} connected=${connectivity.connectedConnectionCount}/${connections.length} valid=${connectivity.valid} drc=${drc.valid} wire=${wire.toFixed(1)} vias=${vias} trapped=${lost.length} ${lost.join(",")}`)
  writeFileSync(`/tmp/bytes-${label}.json`, JSON.stringify(traces))
}
// Current Core order: supplied byte 0, then byte 1.
report("current", route("current-byte1", byte1))
// Lookahead: plan both buses together, keep only byte 0, then route byte 1 alone.
const joint = route("lookahead-plan", { ...base, connections: [...byte0Connections, ...byte1.connections], buses: [bus("byte0", byte0Names), bus("byte1", byte1Names)] })
const plannedByte0 = joint.filter((t: any) => byte0Names.includes(t.connection_name))
console.log(`STEP lookahead kept byte0 traces=${plannedByte0.length}`)
report("lookahead", route("lookahead-byte1", { ...base, connections: byte1.connections, buses: [bus("byte1", byte1Names)], traces: plannedByte0 }))
// Byte 1 first, then byte 0.
const first = route("swap-byte1", { ...base, connections: byte1.connections, buses: [bus("byte1", byte1Names)] })
report("swap", route("swap-byte0", { ...base, connections: byte0Connections, buses: [bus("byte0", byte0Names)], traces: first }))
