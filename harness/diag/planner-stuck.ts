// Diagnostic only; never part of a PR. Runs Pipeline 9 on a phase SRJ and, when
// the port-point planner fails, reports the tiny-hypergraph solveGraph state.
import { readFileSync } from "node:fs"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, effortArg] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const pipeline: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null, effort: Number(effortArg ?? 1) })
while (!pipeline.solved && !pipeline.failed) pipeline.step()
const planner: any = pipeline.portPointPathingSolver
console.log(`STUCK pipelineError=${String(pipeline.error).slice(0, 200)}`)
console.log(`STUCK planner iterations=${planner?.iterations} max=${planner?.MAX_ITERATIONS} phase=${planner?.candidatePortfolioPhase}`)
const tiny: any = planner?.tinyPipelineSolver
console.log(`STUCK tinyPipeline iterations=${tiny?.iterations} max=${tiny?.MAX_ITERATIONS} failed=${tiny?.failed} error=${String(tiny?.error).slice(0, 200)} step=${tiny?.pipelineDef?.[tiny?.currentPipelineStepIndex]?.solverName}`)
const graph: any = tiny?.getSolver?.("solveGraph")
if (graph) {
  const st = graph.state
  console.log(`STUCK solveGraph iterations=${graph.iterations} max=${graph.MAX_ITERATIONS} failed=${graph.failed} error=${String(graph.error).slice(0, 200)}`)
  console.log(`STUCK solveGraph ripCount=${st?.ripCount} currentRouteId=${st?.currentRouteId} queue=${st?.unroutedRoutes?.length ?? st?.routeQueue?.length} routes=${graph.problem?.routeCount ?? graph.problem?.routes?.length}`)
  console.log(`STUCK solveGraph stateKeys=${Object.keys(st ?? {}).join(",")}`)
  console.log(`STUCK solveGraph stats=${JSON.stringify(graph.stats ?? {}).slice(0, 1500)}`)
}
console.log(`STUCK plannerStats=${JSON.stringify(planner?.stats ?? {}).slice(0, 3000)}`)
