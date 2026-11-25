// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// H3 matching bytes routed jointly, and in swapped order.
import { readFileSync, writeFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

const load = (p: string): any => { const r = JSON.parse(readFileSync(p, "utf8")); return r.simpleRouteJson ?? r }
const run = (label: string, input: any): any => {
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(input))
  solver.solve()
  const lengths = (solver.stats?.busLengths ?? []).map((b: any) => `${b.busId}:matched=${b.matched}`).join(" ")
  console.log(`VAR ${label} solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 120)} ${lengths}`)
  return solver
}
const p1 = load("p1.json"), p2 = load("p2.json")
const joint = { ...p1, connections: [...p1.connections, ...p2.connections], buses: [...p1.buses, ...p2.buses] }
const j = run("joint", joint)
if (j.solved) writeFileSync("out/joint-output.json", JSON.stringify({ ...joint, traces: j.getOutput().traces }))
const b1 = run("byte1-first", { ...p2, traces: p1.traces ?? [] })
if (b1.solved) run("byte0-after-byte1", { ...p1, traces: b1.getOutput().traces })
