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
// Which capacity node contains the via, and what obstacles the node knew about.
const nodes = solver.highDensityRouteSolver?.nodePortPoints ?? solver.highDensityRouteSolver?.nodes ?? []
console.log(`NODES ${nodes.length} keys=${Object.keys(solver.highDensityRouteSolver ?? {}).slice(0, 60).join(",")}`)
for (const node of nodes) {
  const c = node.center
  if (!c) continue
  if (Math.abs(c.x - 5.19) < node.width / 2 + 0.01 && Math.abs(c.y - 5.84) < node.height / 2 + 0.01) {
    console.log(`NODE ${node.capacityMeshNodeId} center=(${c.x.toFixed(3)},${c.y.toFixed(3)}) ${node.width?.toFixed?.(3)}x${node.height?.toFixed?.(3)} portPoints=${node.portPoints?.length} keys=${Object.keys(node).join(",")}`)
    for (const p of node.portPoints ?? []) console.log(`  PORT ${p.connectionName} (${p.x.toFixed(3)},${p.y.toFixed(3)}) z=${p.z}`)
  }
}
