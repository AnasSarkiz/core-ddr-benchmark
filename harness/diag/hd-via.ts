// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Stops after high-density repair and reports vias near a watched pad in each
// high-density stage's output, plus the capacity node that held the via.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"

const srj = JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))
const pad = JSON.parse(process.env.WATCH!) as { x: number; y: number; w: number; h: number }
const gapTo = (x: number, y: number, r: number): number =>
  Math.hypot(Math.max(Math.abs(x - pad.x) - pad.w / 2, 0), Math.max(Math.abs(y - pad.y) - pad.h / 2, 0)) - r
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
while (!solver.solved && !solver.failed && solver.getCurrentPhase() !== "highDensityStitchSolver") solver.step()
const show = (label: string, routes: any[]): void => {
  for (const route of routes ?? []) {
    for (const via of route.vias ?? []) {
      const r = (route.viaDiameter ?? 0.45) / 2
      const gap = gapTo(via.x, via.y, r)
      if (gap < 0.2) console.log(`HDVIA ${label} ${route.connectionName} (${via.x.toFixed(3)},${via.y.toFixed(3)}) d=${route.viaDiameter} gap=${gap.toFixed(3)} traceThickness=${route.traceThickness}`)
    }
  }
}
show("route", solver.highDensityRouteSolver?.routes)
show("forceImprove", solver.highDensityForceImproveSolver?.getOutput?.())
show("repair", solver.highDensityRepairSolver?.getOutput?.())
const nodes: any[] = solver.highDensityNodePortPoints ?? []
const hd = solver.highDensityRouteSolver
console.log(`HDSTATS ${JSON.stringify(hd?.stats ?? {}).slice(0, 600)}`)
const via = { x: 5.136, y: 5.869 }
for (const node of nodes) {
  const c = node.center
  const inside = Math.abs(c.x - via.x) <= node.width / 2 + 1e-6 && Math.abs(c.y - via.y) <= node.height / 2 + 1e-6
  if (!inside) continue
  const minX = c.x - node.width / 2
  const padRight = pad.x + pad.w / 2
  const nodeBounds = { minX: c.x - node.width / 2 - hd.obstacleMargin, maxX: c.x + node.width / 2 + hd.obstacleMargin, minY: c.y - node.height / 2 - hd.obstacleMargin, maxY: c.y + node.height / 2 + hd.obstacleMargin }
  const fixedCount = hd.getUpdatedFixedHdRoutes().filter((route: any) => {
    for (const p of route.route ?? []) if (p.x >= nodeBounds.minX - 0.3 && p.x <= nodeBounds.maxX + 0.3 && p.y >= nodeBounds.minY - 0.3 && p.y <= nodeBounds.maxY + 0.3) return true
    return false
  }).length
  console.log(`NODE ${node.capacityMeshNodeId} center=(${c.x.toFixed(3)},${c.y.toFixed(3)}) size=${node.width.toFixed(3)}x${node.height.toFixed(3)} minX=${minX.toFixed(3)} padRightEdge=${padRight.toFixed(3)} nodeEdgeToPad=${(minX - padRight).toFixed(3)} availableZ=${JSON.stringify(node.availableZ)} fixedRoutesNear(rough)=${fixedCount} obstacleMargin=${hd.obstacleMargin}`)
  for (const p of node.portPoints ?? []) console.log(`  PORT ${p.connectionName} (${p.x.toFixed(3)},${p.y.toFixed(3)}) z=${p.z}`)
}
