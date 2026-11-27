// Diagnostic only; never part of a PR. Captures Pipeline 9's capacity mesh
// before and after fixed-wire via-site refinement, and the provisional plan
// that triggered it, so the via sites available to each net can be plotted.
import { readFileSync, writeFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, outPath] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const pipeline: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null, effort: 1 })
const compactNode = (n: any): unknown => [n.capacityMeshNodeId, +n.center.x.toFixed(3), +n.center.y.toFixed(3), +n.width.toFixed(3), +n.height.toFixed(3), n.availableZ, n._containsTarget ? 1 : 0, n._containsObstacle ? 1 : 0]
let lastNodes: any = null
let lastPlanner: any = null
let out: any = null
while (!pipeline.solved && !pipeline.failed) {
  pipeline.step()
  if (pipeline.portPointPathingSolver) lastPlanner = pipeline.portPointPathingSolver
  if (pipeline.capacityNodes !== lastNodes) {
    if (lastNodes && pipeline.hasRefinedFixedWireViaSites && !out) {
      const plan = lastPlanner.getOutput().nodesWithPortPoints
      out = {
        before: lastNodes.map(compactNode),
        after: pipeline.capacityNodes.map(compactNode),
        plan: plan
          .filter((n: any) => n.portPointsInPairs?.length)
          .map((n: any) => [n.capacityMeshNodeId, n.portPointsInPairs.map(([a, b]: any) => [a.rootConnectionName ?? a.connectionName, +a.x.toFixed(3), +a.y.toFixed(3), a.z, +b.x.toFixed(3), +b.y.toFixed(3), b.z])]),
      }
      console.log(`VIASITE before=${lastNodes.length} after=${pipeline.capacityNodes.length} planNodes=${out.plan.length}`)
      writeFileSync(outPath!, gzipSync(JSON.stringify(out)))
      break
    }
    lastNodes = pipeline.capacityNodes
  }
}
console.log(`VIASITE done refined=${pipeline.hasRefinedFixedWireViaSites} error=${String(pipeline.error).slice(0, 200)}`)
