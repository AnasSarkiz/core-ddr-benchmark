// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Captures the Pipeline 9 joint DRC repair input for a fixture, gzipped JSON.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync, gzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
const srj: any = JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
while (!solver.pipeline9JointDrcRepairSolver && !solver.solved && !solver.failed) solver.step()
const p = solver.pipeline9JointDrcRepairSolver.params
if (p.srj !== p.srjWithPointPairs) throw new Error("expected srj === srjWithPointPairs")
const fixture = {
  srj: p.srj,
  originalSrj: p.originalSrj,
  newConnections: p.newConnections,
  newHdRoutes: p.newHdRoutes,
  originalNewHdRoutes: p.originalNewHdRoutes,
  updatedPreloadedTraces: p.updatedPreloadedTraces,
  mutatedPreloadedTraceIds: [...p.mutatedPreloadedTraceIds],
  netMap: p.connMap.netMap,
  obstacles: p.obstacles,
  layerCount: p.layerCount,
  defaultViaDiameter: p.defaultViaDiameter,
  defaultViaHoleDiameter: p.defaultViaHoleDiameter,
  effort: p.effort,
}
const json = JSON.stringify(fixture)
writeFileSync(process.argv[3]!, gzipSync(json, { level: 9 }))
console.log(`CAPTURED bytes=${json.length} routes=${p.newHdRoutes.length} connections=${p.newConnections.length} preloaded=${p.updatedPreloadedTraces.length} obstaclesSame=${p.obstacles === p.srj.obstacles}`)
