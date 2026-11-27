// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout
// with pad-escapes.ts copied to tests/fixtures. Replays ButterStick matching
// phases 1..3 and reports which terminals of the remaining phase still have a
// via site or a surface exit before and after phase 3.
import { readFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"
import { getPadEscape } from "./tests/fixtures/pad-escapes"

const paths = process.argv.slice(2)
const load = (p: string): any => { const r = JSON.parse(readFileSync(p, "utf8")); return r.simpleRouteJson ?? r }
const remaining = load(paths.at(-1)!)
let traces: any[] = load(paths[0]!).traces ?? []
let phase3: any
for (const [index, path] of paths.slice(0, 3).entries()) {
  const input = { ...load(path), traces }
  const solver: any = new BusLanesPipelineSolver(structuredClone(input))
  solver.solve()
  console.log(`ESC phase=${index + 1} solved=${solver.solved} ${String(solver.error ?? "").slice(0, 120)}`)
  if (!solver.solved) process.exit(0)
  if (index === 2) phase3 = { input, out: solver.getOutput().traces }
  else traces = solver.getOutput().traces
}
const variants: Record<string, any[]> = {
  before: phase3.input.traces,
  after: phase3.out,
  afterMinus26: phase3.out.filter((t: any) => t.pcb_trace_id !== "bus_lane_source_net_26"),
}
const results: Record<string, Map<string, string>> = {}
for (const [name, vt] of Object.entries(variants)) {
  const input = { ...phase3.input, traces: vt }
  const map = new Map<string, string>()
  for (const connection of remaining.connections)
    connection.pointsToConnect.forEach((p: any, end: number) => {
      map.set(`${connection.name}:${end}@(${p.x.toFixed(1)},${p.y.toFixed(1)})`, String(getPadEscape({ input, connection, end, viaTargetLayer: "bottom" })))
    })
  results[name] = map
  const counts: Record<string, number> = {}
  for (const v of map.values()) counts[v] = (counts[v] ?? 0) + 1
  console.log(`ESC ${name} ${JSON.stringify(counts)}`)
}
for (const key of results.before.keys()) {
  const row = Object.keys(variants).map((v) => results[v].get(key))
  if (new Set(row).size > 1) console.log(`ESC change ${key} ${row.join(" -> ")}`)
}
