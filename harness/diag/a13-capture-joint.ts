import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync, gzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import type { SimpleRouteJson } from "lib/types"

const [fixturePath, outPath] = process.argv.slice(2)
const input: SimpleRouteJson = JSON.parse(gunzipSync(new Uint8Array(readFileSync(fixturePath))).toString("utf8"))
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
solver.solve()
const params = solver.pipeline9JointDrcRepairSolver.params
console.log(`CAPTURE solved=${solver.solved} srjSameAsPointPairs=${params.srj === params.srjWithPointPairs} newHdRoutes=${params.newHdRoutes.length} preloaded=${params.updatedPreloadedTraces.length} mutated=${params.mutatedPreloadedTraceIds.size}`)
const fixture = {
  srj: params.srj,
  originalSrj: params.originalSrj,
  newConnections: params.newConnections,
  newHdRoutes: params.newHdRoutes,
  originalNewHdRoutes: params.originalNewHdRoutes,
  updatedPreloadedTraces: params.updatedPreloadedTraces,
  mutatedPreloadedTraceIds: [...params.mutatedPreloadedTraceIds],
  netMap: params.connMap.netMap,
  obstacles: params.obstacles,
  layerCount: params.layerCount,
  defaultViaDiameter: params.defaultViaDiameter,
  defaultViaHoleDiameter: params.defaultViaHoleDiameter,
  effort: params.effort,
}
writeFileSync(outPath, gzipSync(JSON.stringify(fixture), { level: 9 }))
console.log(`CAPTURE wrote ${outPath} ${readFileSync(outPath).length} bytes`)
