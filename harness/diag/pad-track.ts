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
const pads = srj.obstacles.filter((o: any) => points.some(([x, y]) => Math.hypot(o.center.x - x, o.center.y - y) < 0.8))
const padDist = (px: number, py: number, o: any): number => {
  if (o.shape === "circle" || o.type === "oval") return Math.hypot(px - o.center.x, py - o.center.y) - Math.min(o.width, o.height) / 2
  const a = -((o.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const dx = px - o.center.x, dy = py - o.center.y
  const lx = Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) - o.width / 2, ly = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) - o.height / 2
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0)
}
const report = (stage: string, routes: any[]): void => {
  const hits: string[] = []
  for (const r of routes ?? []) {
    const names = [r.connectionName, r.rootConnectionName].filter(Boolean).map(String)
    for (let i = 0; i + 1 < r.route.length; i++) {
      const p = r.route[i], q = r.route[i + 1]
      if (p.z !== q.z) continue
      for (const o of pads) {
        const zs = o.zLayers ?? o.layers.map(layerZ)
        if (!zs.includes(p.z)) continue
        if ((o.connectedTo ?? []).some((c: string) => names.some((n) => n.startsWith(c) || c.startsWith(n)))) continue
        let best = Infinity, bx = 0, by = 0
        const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.005))
        for (let k = 0; k <= n; k++) { const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n; const d = padDist(x, y, o); if (d < best) { best = d; bx = x; by = y } }
        const gap = best - r.traceThickness / 2
        if (gap < 0) hits.push(`${names[0]} z=${p.z} pad(${o.center.x.toFixed(2)},${o.center.y.toFixed(2)}) gap=${gap.toFixed(4)} at(${bx.toFixed(2)},${by.toFixed(2)})`)
      }
    }
  }
  console.log(`PAD ${label} ${stage} overlaps=${hits.length}`)
  for (const h of [...new Set(hits)].slice(0, 12)) console.log(`PAD ${label}   ${h}`)
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
  last = phase
}
console.log(`PAD ${label} done solved=${solver.solved}`)
