// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// At each high-density stage, list trace segments overlapping a pad of another
// net near given points (env POINTS='[[x,y],...]').
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
const label = process.argv[3]
const srj: any = JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))
const points: [number, number][] = JSON.parse(process.env.POINTS!)
const layerZ = (l: string): number => (l === "top" ? 0 : l === "bottom" ? srj.layerCount - 1 : Number(l.replace(/\D/g, "")))
const pads = points.map(([x, y]) => srj.obstacles.filter((o: any) => o.layers.includes("top")).sort((a: any, b: any) => Math.hypot(a.center.x - x, a.center.y - y) - Math.hypot(b.center.x - x, b.center.y - y))[0])
for (const o of pads) console.log(`PAD ${process.argv[3]} padAt(${o.center.x.toFixed(3)},${o.center.y.toFixed(3)}) ${o.width.toFixed(3)}x${o.height.toFixed(3)} ${o.shape ?? o.type} conn=${JSON.stringify(o.connectedTo).slice(0, 160)}`)
const padDist = (px: number, py: number, o: any): number => {
  if (o.shape === "circle" || o.type === "oval") return Math.hypot(px - o.center.x, py - o.center.y) - Math.min(o.width, o.height) / 2
  const a = -((o.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const dx = px - o.center.x, dy = py - o.center.y
  const lx = Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) - o.width / 2, ly = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) - o.height / 2
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0)
}
const segs = (routes: any[]): { name: string; z: number; x1: number; y1: number; x2: number; y2: number; r: number }[] =>
  (routes ?? []).flatMap((r: any) => (r.route ?? []).slice(0, -1).flatMap((p: any, i: number) => {
    const q = r.route[i + 1]
    if (p.route_type !== undefined) return p.route_type === "wire" && q.route_type === "wire" && p.layer === q.layer ? [{ name: String(r.connection_name ?? r.pcb_trace_id), z: layerZ(p.layer), x1: p.x, y1: p.y, x2: q.x, y2: q.y, r: (p.width ?? 0.1) / 2 }] : []
    return p.z === q.z ? [{ name: String(r.connectionName), z: p.z, x1: p.x, y1: p.y, x2: q.x, y2: q.y, r: r.traceThickness / 2 }] : []
  }))
const report = (stage: string, routes: any[]): void => {
  const parts: string[] = []
  pads.forEach((o: any, idx: number) => {
    let best = Infinity, who = ""
    for (const s of segs(routes)) {
      if (s.z !== 0) continue
      const n = Math.max(2, Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 0.005))
      for (let k = 0; k <= n; k++) { const x = s.x1 + ((s.x2 - s.x1) * k) / n, y = s.y1 + ((s.y2 - s.y1) * k) / n; const d = padDist(x, y, o) - s.r; if (d < best) { best = d; who = `${s.name}@(${x.toFixed(2)},${y.toFixed(2)})` } }
    }
    parts.push(`p${idx}:${best.toFixed(3)} ${who}`)
  })
  console.log(`PAD ${label} ${stage} | ${parts.join(" | ")}`)
}
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
let last = ""
while (!solver.solved && !solver.failed) {
  solver.step()
  const phase = solver.getCurrentPhase()
  if (phase === last) continue
  if (last === "highDensityRouteSolver") report("hdRoute", solver.highDensityRouteSolver.routes)
  if (last === "highDensityForceImproveSolver") report("forceImprove", solver.highDensityForceImproveSolver.getOutput())
  if (last === "highDensityRepairSolver") report("hdRepair", solver.highDensityRepairSolver.getOutput())
  if (last === "highDensityStitchSolver") report("stitch", solver.highDensityStitchSolver.mergedHdRoutes)
  if (last === "traceSimplificationSolver") report("simplify", solver.traceSimplificationSolver.simplifiedHdRoutes)
  if (last === "traceWidthSolver") report("width", solver.traceWidthSolver.getHdRoutesWithWidths())
  last = phase
}
report("final", solver.getOutputSimplifiedPcbTraces())
console.log(`PAD ${label} done solved=${solver.solved}`)
