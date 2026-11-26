// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
import { readFileSync, writeFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const raw = JSON.parse(readFileSync(process.argv[2]!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const run = (label: string, variant: any): any => {
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(variant))
  solver.solve()
  console.log(`VAR ${label} solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 300)}`)
  return solver
}
const joint = run("joint", input)
for (const bus of input.buses) console.log(`BUS ${bus.busId} ${bus.connectionNames.join(",")}`)
const byBus = (ids: string[]) => {
  const names = new Set(input.buses.filter((b: any) => ids.includes(b.busId)).flatMap((b: any) => b.connectionNames))
  return { ...input, connections: input.connections.filter((c: any) => names.has(c.name)), buses: input.buses.filter((b: any) => ids.includes(b.busId)) }
}
const b0 = run("byte0-alone", byBus(["DDR_original_U9_byte0"]))
run("byte1-alone", byBus(["DDR_original_U9_byte1", "DDR_original_U9_byte1_3"]))
run("joint-no-targets", { ...input, buses: input.buses.map((b: any) => ({ busId: b.busId, name: b.name, connectionNames: b.connectionNames, allowedLayers: b.allowedLayers })) })
if (b0.solved) run("byte1-after-byte0", { ...byBus(["DDR_original_U9_byte1", "DDR_original_U9_byte1_3"]), traces: b0.getOutput().traces })
