// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Routes a captured remaining-phase request with the unminified pipeline and
// reports where it stops and how long each stage takes.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"

const file = process.argv[2]
const out = process.argv[3]
const srj = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"))
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, {})
const started = performance.now()
let last = ""
try {
  while (!solver.solved && !solver.failed && performance.now() - started < Number(process.argv[4] ?? 600) * 1000) {
    solver.step()
    const phase = solver.getCurrentPhase()
    if (phase !== last) {
      console.log(`STAGE t=${((performance.now() - started) / 1000).toFixed(1)}s ${phase}`)
      last = phase
    }
  }
} catch (error) {
  console.log(`THREW ${String(error).slice(0, 600)}`)
}
const chain: string[] = []
let active = solver.activeSubSolver
while (active) {
  chain.push(`${active.constructor.name}(iterations=${active.iterations},max=${active.MAX_ITERATIONS},failed=${active.failed},error=${String(active.error).slice(0, 200)})`)
  active = active.activeSubSolver
}
console.log(`RESULT ${file} t=${((performance.now() - started) / 1000).toFixed(1)}s solved=${solver.solved} failed=${solver.failed} iterations=${solver.iterations} max=${solver.MAX_ITERATIONS} error=${String(solver.error).slice(0, 400)}`)
console.log(`CHAIN ${chain.join(" > ")}`)
console.log(`TIMES ${JSON.stringify(Object.fromEntries(Object.entries(solver.timeSpentOnPhase ?? {}).map(([k, v]: any) => [k, Math.round(v)])))}`)
if (solver.solved) writeFileSync(out, JSON.stringify(solver.getOutputSimpleRouteJson()))
