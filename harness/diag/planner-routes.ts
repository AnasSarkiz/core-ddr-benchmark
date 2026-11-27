// Diagnostic only; never part of a PR. Runs Pipeline 9 on a phase SRJ and
// records, per planner route, how many solveGraph iterations it consumed, how
// often it was attempted, and every rip/rerip event, so the route that burns
// the iteration budget can be identified.
import { readFileSync } from "node:fs"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, effortArg] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const pipeline: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, {
  cacheProvider: null,
  effort: Number(effortArg ?? 1),
})

const itersByRoute = new Map<number, number>()
const attemptsByRoute = new Map<number, number>()
const events: string[] = []
let graphSeen: any
let lastIter = 0
let lastRoute: number | undefined
let lastRip = 0
let lastGlobal = 0
let lastSelective = 0
let steps = 0

while (!pipeline.solved && !pipeline.failed) {
  pipeline.step()
  steps++
  const tiny: any = pipeline.portPointPathingSolver?.tinyPipelineSolver
  const graph: any = tiny?.getSolver?.("solveGraph")
  if (!graph) continue
  if (graph !== graphSeen) {
    events.push(`new solveGraph instance at pipelineStep=${steps}`)
    graphSeen = graph
    lastIter = graph.iterations
    lastRoute = undefined
  }
  const route: number | undefined = graph.state?.currentRouteId
  const delta = graph.iterations - lastIter
  lastIter = graph.iterations
  if (lastRoute !== undefined) itersByRoute.set(lastRoute, (itersByRoute.get(lastRoute) ?? 0) + delta)
  if (route !== undefined && route !== lastRoute) attemptsByRoute.set(route, (attemptsByRoute.get(route) ?? 0) + 1)
  lastRoute = route
  const rip = graph.state?.ripCount ?? 0
  const stats = graph.getSelectiveReripStats?.()
  const global = stats?.globalReripCount ?? 0
  const selective = stats?.selectiveRipCount ?? 0
  if (rip !== lastRip || global !== lastGlobal || selective !== lastSelective) {
    events.push(
      `iter=${graph.iterations} rip=${rip} global=${global}(${stats?.globalReripReason}) selective=${selective} failed=${stats?.lastFailedRouteId} owners=${JSON.stringify(stats?.lastDirectOwnerRouteIds)} ripped=${JSON.stringify(stats?.lastRippedRouteIds)} unrouted=${graph.state?.unroutedRoutes?.length}`,
    )
    lastRip = rip
    lastGlobal = global
    lastSelective = selective
  }
}

const graph: any = graphSeen
console.log(`ROUTES pipelineError=${String(pipeline.error).slice(0, 300)}`)
if (!graph) process.exit(0)
const { problem, topology } = graph
const describe = (r: number): string => {
  const meta = problem.routeMetadata?.[r] ?? {}
  const port = (p: number): string =>
    `${p}@(${topology.portX[p].toFixed(2)},${topology.portY[p].toFixed(2)},z${topology.portZ[p]}) ${topology.portMetadata?.[p]?.serializedPortId ?? ""}`
  return `route=${r} conn=${meta.connectionId} net=${problem.routeNet[r]} fixed=${problem.routeIsFixed?.[r] ?? 0} start=${port(problem.routeStartPort[r])} end=${port(problem.routeEndPort[r])} startRegion=${meta.startRegionId} endRegion=${meta.endRegionId}`
}
console.log(`ROUTES iterations=${graph.iterations} max=${graph.MAX_ITERATIONS} routeCount=${problem.routeCount}`)
const top = [...itersByRoute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [r, n] of top) console.log(`ROUTES top iters=${n} attempts=${attemptsByRoute.get(r)} ${describe(r)}`)
for (const r of [3, 5, 10, 19]) console.log(`ROUTES named ${describe(r)} iters=${itersByRoute.get(r)} attempts=${attemptsByRoute.get(r)}`)
console.log(`ROUTES events=${events.length}`)
for (const e of events.slice(0, 40)) console.log(`ROUTES event ${e}`)
if (events.length > 40) for (const e of events.slice(-40)) console.log(`ROUTES event ${e}`)
