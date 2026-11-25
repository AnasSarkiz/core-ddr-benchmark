// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// Routes matching phases in order, feeding each phase the copper of the last.
import { readFileSync, writeFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const [outDir, ...paths] = process.argv.slice(2)
let traces: any[] | undefined
for (const [index, path] of paths.entries()) {
  const raw = JSON.parse(readFileSync(path, "utf8"))
  const input = raw.simpleRouteJson ?? raw
  if (traces) input.traces = traces
  writeFileSync(`${outDir}/phase-${index + 1}-input.json`, JSON.stringify(input))
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(input))
  solver.solve()
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const lengths = (solver.stats?.busLengths ?? []).map((bus: any) => `${bus.busId}:matched=${bus.matched},skew=${bus.skewMm?.toFixed?.(2)},min=${bus.minLengthMm}`).join(" ")
  console.log(`CHAIN phase=${index + 1} solved=${solver.solved} t=${seconds}s code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 160)} ${lengths}`)
  if (!solver.solved) break
  traces = solver.getOutput().traces
}
