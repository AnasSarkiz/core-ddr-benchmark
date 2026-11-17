// Diagnostic only; never part of a PR. Routes A64's byte phases in order, each
// beside the previous phases' output, and reports outcome and planning stats.
import { readFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const files = process.argv.slice(2)
let traces: any[] = []
for (const file of files) {
  const request = JSON.parse(readFileSync(file, "utf8"))
  request.traces = traces
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(request)
  solver.solve()
  const stats = Object.fromEntries(Object.entries(solver.stats ?? {}).filter(([k]) => /Stranded|planned/i.test(k)))
  console.log(`CHAIN ${file.split("/").at(-1)} solved=${solver.solved} error=${String(solver.error).slice(0, 120)} seconds=${((performance.now() - started) / 1000).toFixed(1)} stats=${JSON.stringify(stats)}`)
  if (!solver.solved) break
  traces = solver.getOutput().traces
}
