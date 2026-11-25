// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// Routes one failing matching phase and reports each lane-child failure and
// which surface-finishing path ended the solve.
import { readFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const [path, label] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(path!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const solver: any = new BusLanesPipelineSolver(structuredClone(input))
const started = performance.now()
const seen = new Set<string>()
let finishing = ""
while (!solver.solved && !solver.failed) {
  const childBefore = solver.child
  const finishingBefore = solver.surfaceFinishing
  solver.step()
  const child = childBefore ?? solver.child
  if (child?.failed) {
    const key = `${child.failureCode} ${String(child.error).slice(0, 160)} phase=${child.phase}`
    if (!seen.has(key)) {
      seen.add(key)
      console.log(`DIAG ${label} childFailed t=${((performance.now() - started) / 1000).toFixed(1)}s ${key} stats=${JSON.stringify(child.stats ?? {}).slice(0, 400)}`)
    }
  }
  if (!finishingBefore && solver.surfaceFinishing) {
    finishing = solver.surfaceFinishing.toString?.() ?? ""
    console.log(`DIAG ${label} surfaceFinishing started stage=${solver.phase} canNegotiate=${solver.canNegotiateGeneratedSites} t=${((performance.now() - started) / 1000).toFixed(1)}s`)
  }
}
console.log(`DIAG ${label} result solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s code=${solver.failureCode} error=${String(solver.error).slice(0, 200)} stats=${JSON.stringify(solver.stats ?? {}).slice(0, 600)}`)
