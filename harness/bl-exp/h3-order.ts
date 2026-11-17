// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout that
// has the #203 fixtures. Compares routing orders for H3's two data bytes and
// counts later terminals left without access.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { BusLanesPipelineSolver } from "./lib"
import { getPadEscape } from "./tests/fixtures/pad-escapes"

const fixture = JSON.parse(gunzipSync(readFileSync("tests/fixtures/h3-pending-pad-escapes/input.json.gz")).toString("utf8"))
const byte1 = fixture.byte1Request
const byte0Names: string[] = fixture.fixedConnections.map((c: any) => c.name)
const byte1Names: string[] = byte1.connections.map((c: any) => c.name)
const base = { ...byte1, traces: [] }
const bus = (id: string, names: string[]): any => ({ busId: id, name: id, connectionNames: names, allowedLayers: ["top", "bottom"] })
const route = (label: string, request: any): any[] | null => {
  const started = performance.now()
  const solver = new BusLanesPipelineSolver(structuredClone(request))
  solver.solve()
  console.log(`STEP ${label} solved=${solver.solved} error=${String(solver.error).slice(0, 160)} seconds=${((performance.now() - started) / 1000).toFixed(1)}`)
  return solver.solved ? solver.getOutput().traces : null
}
const trapped = (label: string, traces: any[]): void => {
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
  console.log(`ORDER ${label} traces=${traces.length} wire=${wire.toFixed(1)} vias=${vias} trapped=${lost.length} ${lost.join(",")}`)
}
const mode = process.argv[2]
const byte0Connections = fixture.fixedConnections
if (mode === "current") trapped("byte0-then-byte1 (supplied byte0)", route("byte1", byte1) ?? [])
if (mode === "joint") {
  const t = route("joint", { ...base, connections: [...byte0Connections, ...byte1.connections], buses: [bus("byte0", byte0Names), bus("byte1", byte1Names)] })
  if (t) trapped("joint two buses", t)
}
if (mode === "swap") {
  const first = route("byte1-first", { ...base, connections: byte1.connections, buses: [bus("byte1", byte1Names)] })
  if (first) {
    trapped("byte1 alone", first)
    const second = route("byte0-second", { ...base, connections: byte0Connections, buses: [bus("byte0", byte0Names)], traces: first })
    if (second) trapped("byte1-then-byte0", second)
  }
}
