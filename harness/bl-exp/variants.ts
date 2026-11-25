// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// One phase input with and without its length targets and earlier copper.
import { readFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const raw = JSON.parse(readFileSync(process.argv[2]!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const run = (label: string, variant: any): void => {
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(variant))
  solver.solve()
  const lengths = (solver.stats?.busLengths ?? []).map((b: any) => `${b.busId}:matched=${b.matched},skew=${b.skewMm?.toFixed?.(1)}`).join(" ")
  console.log(`VAR ${label} solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 120)} ${lengths}`)
}
const free = { ...input, buses: input.buses.map((b: any) => ({ busId: b.busId, name: b.name, connectionNames: b.connectionNames, allowedLayers: b.allowedLayers })) }
run("as-given", input)
run("no-length-targets", free)
run("without-earlier-copper", { ...input, traces: [] })
run("no-targets-without-copper", { ...free, traces: [] })
