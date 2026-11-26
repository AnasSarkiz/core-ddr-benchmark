// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// One phase input in one variant: as-given, no-targets, no-copper, neither.
import { readFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const [path, variant] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(path!, "utf8"))
let input = raw.simpleRouteJson ?? raw
if (variant === "no-targets" || variant === "neither")
  input = { ...input, buses: input.buses.map((b: any) => ({ busId: b.busId, name: b.name, connectionNames: b.connectionNames, allowedLayers: b.allowedLayers })) }
if (variant === "no-copper" || variant === "neither") input = { ...input, traces: [] }
const started = performance.now()
const solver: any = new BusLanesPipelineSolver(structuredClone(input))
solver.solve()
const lengths = (solver.stats?.busLengths ?? []).map((b: any) => `${b.busId}:matched=${b.matched},skew=${b.skewMm?.toFixed?.(2)}`).join(" ")
console.log(`VAR ${variant} solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s iterations=${solver.iterations} code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 160)} ${lengths}`)
