// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// Replays ButterStick's matching bus phases and writes the remaining-phase
// input with the bus copper fixed, as Core hands it over.
import { readFileSync, writeFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const [variant, outPath, ...paths] = process.argv.slice(2)
const load = (p: string): any => { const r = JSON.parse(readFileSync(p, "utf8")); return r.simpleRouteJson ?? r }
let traces: any[] = load(paths[0]!).traces ?? []
for (const [index, path] of paths.slice(0, -1).entries()) {
  let input = { ...load(path), traces }
  const isByte = input.connections.length >= 8
  if (variant === "untuned-bytes" && isByte)
    input = { ...input, buses: input.buses.map((b: any) => ({ busId: b.busId, name: b.name, connectionNames: b.connectionNames, allowedLayers: b.allowedLayers })) }
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(input))
  solver.solve()
  console.log(`CHAIN ${variant} phase=${index + 1} conns=${input.connections.length} solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s ${String(solver.error ?? "").slice(0, 120)}`)
  if (!solver.solved) process.exit(0)
  traces = solver.getOutput().traces
}
const remaining = load(paths.at(-1)!)
writeFileSync(outPath!, JSON.stringify({ ...remaining, traces: traces.map((t: any) => ({ ...t, isFixed: true })) }))
