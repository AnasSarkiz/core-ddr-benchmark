// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const { BusLanesPipelineSolver } = await import(resolve(process.cwd(), "lib/index.ts"))
const file = process.argv[2]
const out = process.argv[3]
const { input } = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"))
const solver = new BusLanesPipelineSolver(input)
const started = performance.now()
let last = ""
let steps = 0
while (!solver.solved && !solver.failed && steps < 20_000_000) {
  solver.step()
  steps++
  if (solver.phase !== last) {
    last = solver.phase
    console.log(`PHASE t=${((performance.now() - started) / 1000).toFixed(1)}s steps=${steps} phase=${solver.phase}`)
  }
}
console.log(`RESULT ${file} t=${((performance.now() - started) / 1000).toFixed(1)}s solved=${solver.solved} error=${solver.error}`)
if (solver.solved) writeFileSync(out, JSON.stringify({ traces: solver.getOutput().traces }))
