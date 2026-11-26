// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
import { readFileSync, writeFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"
import { initialSignalDogbones } from "./lib/initial-signal-dogbones"

const raw = JSON.parse(readFileSync(process.argv[2]!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const connection = input.connections.find((c: any) => c.name === "source_net_44")
const alone = { ...input, connections: [connection], buses: input.buses.filter((b: any) => b.connectionNames.includes("source_net_44")) }
const solver: any = new BusLanesPipelineSolver(structuredClone(alone))
solver.solve()
console.log(`VAR branch-alone solved=${solver.solved} code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 200)}`)
const options = (target: string) => ({ targetLayers: new Map([["source_net_44", target]]), viaDiameter: input.minViaPadDiameter, viaHoleDiameter: input.minViaHoleDiameter, traceWidth: input.minTraceWidth, clearance: input.minTraceToPadEdgeClearance, boardEdgeClearance: input.minBoardEdgeClearance, holeToHoleClearance: input.minViaHoleEdgeToViaHoleEdgeClearance })
const [p0, p1, p2] = connection.pointsToConnect
const first = initialSignalDogbones({ ...input, connections: [{ ...connection, pointsToConnect: [p0, p1] }], buses: [], differentialPairs: [], traces: [] }, options("inner1"), 0)
for (const t of first.traces) console.log(`ESCAPE ${JSON.stringify(t.route.map((p: any) => [p.route_type, +p.x.toFixed(3), +p.y.toFixed(3), p.layer ?? p.from_layer + ">" + p.to_layer]))}`)
const tryPair = (label: string, pts: any[], traces: any[]) => {
  try { initialSignalDogbones({ ...input, connections: [{ ...connection, pointsToConnect: pts }], buses: [], differentialPairs: [], traces }, options("inner1"), 0); console.log(`PAIR ${label} ok`) }
  catch (e) { console.log(`PAIR ${label} failed ${String((e as Error).message).slice(0, 120)}`) }
}
tryPair("p2-alone-empty-board", [p2, p0], [])
tryPair("p2-after-first-escapes", [p2, first.connections[0].pointsToConnect[0]], first.traces)
writeFileSync("out/imx6-branch.json", JSON.stringify({ input: alone, escapes: first.traces }))
