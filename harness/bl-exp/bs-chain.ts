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
  const boxes = new Map<string, number[]>()
  for (const o of input.obstacles) {
    if (!o.componentId) continue
    const b = boxes.get(o.componentId) ?? [Infinity, -Infinity, Infinity, -Infinity]
    b[0] = Math.min(b[0], o.center.x - o.width / 2); b[1] = Math.max(b[1], o.center.x + o.width / 2)
    b[2] = Math.min(b[2], o.center.y - o.height / 2); b[3] = Math.max(b[3], o.center.y + o.height / 2)
    boxes.set(o.componentId, b)
  }
  for (const t of traces.filter((t: any) => input.connections.some((c: any) => c.name === t.connection_name))) {
    const w = t.route.filter((p: any) => p.route_type === "wire")
    let total = 0
    const inside: Record<string, number> = {}
    for (let i = 1; i < w.length; i++) {
      const d = Math.hypot(w[i].x - w[i - 1].x, w[i].y - w[i - 1].y)
      total += d
      const mx = (w[i].x + w[i - 1].x) / 2, my = (w[i].y + w[i - 1].y) / 2
      for (const [c, b] of boxes) if (mx > b[0] && mx < b[1] && my > b[2] && my < b[3]) inside[c] = (inside[c] ?? 0) + d
    }
    console.log(`CHAIN field phase=${index + 1} ${t.pcb_trace_id} len=${total.toFixed(1)} inField=${JSON.stringify(Object.fromEntries(Object.entries(inside).map(([k, v]) => [k, +v.toFixed(1)])))}`)
  }
}
const remaining = load(paths.at(-1)!)
writeFileSync(outPath!, JSON.stringify({ ...remaining, traces: traces.map((t: any) => ({ ...t, isFixed: true })) }))
