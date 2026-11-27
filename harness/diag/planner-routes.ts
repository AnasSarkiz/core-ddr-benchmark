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
let instance = 0

while (!pipeline.solved && !pipeline.failed) {
  pipeline.step()
  steps++
  const tiny: any = pipeline.portPointPathingSolver?.tinyPipelineSolver
  const graph: any = tiny?.getSolver?.("solveGraph")
  if (!graph) continue
  if (graph !== graphSeen) {
    if (graphSeen) {
      const per = [...itersByRoute.entries()].map(([r, n]) => [r, n, attemptsByRoute.get(r) ?? 0]).sort((a, b) => b[1] - a[1])
      events.push(`instance ${instance} routesTouched=${per.length} top=${JSON.stringify(per.slice(0, 12))}`)
    }
    if (graphSeen) events.push(`end solveGraph instance iterations=${graphSeen.iterations} solved=${graphSeen.solved} failed=${graphSeen.failed} unrouted=${graphSeen.state?.unroutedRoutes?.length} current=${graphSeen.state?.currentRouteId} error=${String(graphSeen.error).slice(0, 120)}`)
    events.push(`new solveGraph instance at pipelineStep=${steps} phase=${pipeline.portPointPathingSolver?.candidatePortfolioPhase}`)
    graphSeen = graph
    instance++
    itersByRoute.clear()
    attemptsByRoute.clear()
    lastIter = graph.iterations
    lastRoute = undefined
  }
  if (Math.floor(graph.iterations / 100_000) !== Math.floor(lastIter / 100_000))
    events.push(`checkpoint iter=${graph.iterations} unrouted=${graph.state?.unroutedRoutes?.length} current=${graph.state?.currentRouteId} rip=${graph.state?.ripCount}`)
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
console.log(`ROUTES iterations=${graph.iterations} max=${graph.MAX_ITERATIONS} solved=${graph.solved} routeCount=${problem.routeCount} portCount=${topology.portCount} regionCount=${topology.regionCount} initialAssignments=${problem.initialAssignments?.length ?? 0} fixedRoutes=${problem.routeIsFixed ? problem.routeIsFixed.reduce((a: number, b: number) => a + b, 0) : 0}`)
const perAttempt = [...itersByRoute.entries()].map(([r, n]) => n / (attemptsByRoute.get(r) ?? 1)).sort((a, b) => a - b)
const q = (f: number): number => Math.round(perAttempt[Math.floor(f * (perAttempt.length - 1))] ?? 0)
console.log(`ROUTES perAttempt routes=${perAttempt.length} p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${q(1)} sumIters=${[...itersByRoute.values()].reduce((a, b) => a + b, 0)}`)
console.log(`ROUTES plannerPhase=${pipeline.portPointPathingSolver?.candidatePortfolioPhase} stats=${JSON.stringify(pipeline.portPointPathingSolver?.stats ?? {}).slice(0, 1200)}`)
const top = [...itersByRoute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [r, n] of top) console.log(`ROUTES top iters=${n} attempts=${attemptsByRoute.get(r)} ${describe(r)}`)
for (const r of [3, 5, 10, 19]) console.log(`ROUTES named ${describe(r)} iters=${itersByRoute.get(r)} attempts=${attemptsByRoute.get(r)}`)
console.log(`ROUTES events=${events.length}`)
for (const e of events.length > 80 ? [...events.slice(0, 40), "...", ...events.slice(-40)] : events) console.log(`ROUTES event ${e}`)
