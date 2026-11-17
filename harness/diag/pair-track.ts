// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Reports the closest same-layer copper gap between two nets near a point in
// each high-density stage's routes and in the final output.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"

const srj = JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))
const [netA, netB] = (process.env.NETS ?? "").split(",")
const at = JSON.parse(process.env.POINT!) as { x: number; y: number }
type Seg = { x1: number; y1: number; x2: number; y2: number; z: string; r: number }
const segDist = (a: Seg, b: Seg): number => {
  const pt = (px: number, py: number, s: Seg): number => {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L))
    return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy))
  }
  return Math.min(pt(a.x1, a.y1, b), pt(a.x2, a.y2, b), pt(b.x1, b.y1, a), pt(b.x2, b.y2, a))
}
const near = (s: Seg): boolean => Math.hypot((s.x1 + s.x2) / 2 - at.x, (s.y1 + s.y2) / 2 - at.y) < 1.5
const fromHd = (routes: any[], net: string): Seg[] =>
  (routes ?? []).filter((r) => String(r.connectionName).startsWith(net) || String(r.rootConnectionName ?? "").startsWith(net)).flatMap((r) =>
    r.route.slice(0, -1).flatMap((p: any, i: number) => {
      const q = r.route[i + 1]
      return p.z === q.z ? [{ x1: p.x, y1: p.y, x2: q.x, y2: q.y, z: String(p.z), r: r.traceThickness / 2 }] : []
    }),
  )
const _unused = 0
const fromPcb = (traces: any[], net: string): Seg[] =>
  traces.filter((t) => String(t.connection_name ?? t.pcb_trace_id).startsWith(net)).flatMap((t) =>
    t.route.slice(0, -1).flatMap((p: any, i: number) => {
      const q = t.route[i + 1]
      return p.route_type === "wire" && q.route_type === "wire" && p.layer === q.layer
        ? [{ x1: p.x, y1: p.y, x2: q.x, y2: q.y, z: p.layer, r: (p.width ?? 0.1016) / 2 }]
        : []
    }),
  )
const report = (label: string, a: Seg[], b: Seg[]): void => {
  let best = Infinity, where = ""
  for (const s of a.filter(near)) for (const t of b.filter(near)) {
    if (s.z !== t.z) continue
    const gap = segDist(s, t) - s.r - t.r
    if (gap < best) { best = gap; where = `z=${s.z} A(${s.x1.toFixed(2)},${s.y1.toFixed(2)})-(${s.x2.toFixed(2)},${s.y2.toFixed(2)}) wA=${(2 * s.r).toFixed(4)} B(${t.x1.toFixed(2)},${t.y1.toFixed(2)})-(${t.x2.toFixed(2)},${t.y2.toFixed(2)}) wB=${(2 * t.r).toFixed(4)}` }
  }
  console.log(`PAIR ${label} segsA=${a.filter(near).length} segsB=${b.filter(near).length} gap=${best.toFixed(4)} ${where}`)
}
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
let last = ""
while (!solver.solved && !solver.failed) {
  solver.step()
  const phase = solver.getCurrentPhase()
  if (phase === last) continue
  if (last === "highDensityRouteSolver") report("hdRoute", fromHd(solver.highDensityRouteSolver.routes, netA!), fromHd(solver.highDensityRouteSolver.routes, netB!))
  if (last === "highDensityForceImproveSolver") { const r = solver.highDensityForceImproveSolver.getOutput(); report("forceImprove", fromHd(r, netA!), fromHd(r, netB!)) }
  if (last === "highDensityRepairSolver") { const r = solver.highDensityRepairSolver.getOutput(); report("hdRepair", fromHd(r, netA!), fromHd(r, netB!)) }
  if (last === "highDensityStitchSolver") { const r = solver.highDensityStitchSolver.mergedHdRoutes; report("stitch", fromHd(r, netA!), fromHd(r, netB!)) }
  if (last === "traceSimplificationSolver") { const r = solver.traceSimplificationSolver.simplifiedHdRoutes; report("simplify", fromHd(r, netA!), fromHd(r, netB!)) }
  if (last === "traceWidthSolver") { const r = solver.traceWidthSolver.getHdRoutesWithWidths(); report("width", fromHd(r, netA!), fromHd(r, netB!)) }
  if (last === "globalDrcForceImproveSolver") { try { const r = solver.globalDrcForceImproveSolver.getOutput?.()?.hdRoutes ?? solver.globalDrcForceImproveSolver.getOutput?.(); report("globalDrc", fromHd(r, netA!), fromHd(r, netB!)) } catch (e) { console.log(`PAIR globalDrc n/a ${String(e).slice(0, 80)}`) } }
  if (last === "pipeline9JointDrcRepairSolver") { try { const o = solver.pipeline9JointDrcRepairSolver.getOutput?.(); const r = o?.hdRoutes ?? o?.newHdRoutes ?? o; report("jointRepair", fromHd(r, netA!), fromHd(r, netB!)); console.log(`JOINTKEYS ${Object.keys(o ?? {}).join(",")}`) } catch (e) { console.log(`PAIR jointRepair n/a ${String(e).slice(0, 80)}`) } }
  last = phase
}
const out = solver.getOutputSimplifiedPcbTraces()
report("final", fromPcb(out, netA!), fromPcb(out, netB!))
console.log(`STAGES ${Object.keys(solver.timeSpentOnPhase ?? {}).join(",")}`)
