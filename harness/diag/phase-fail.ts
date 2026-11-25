import { readFileSync } from "node:fs"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, label] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath, "utf8"))
const input = raw.simpleRouteJson ?? raw
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
const started = Date.now()
let stageStarted = Date.now()
let guard = 0
while (!solver.solved && !solver.failed && guard++ < 100_000_000) {
  const before = solver.currentPipelineStepIndex
  try { solver.step() } catch (e) { console.log(`PHASE ${label} threw ${(e as Error).message.slice(0, 300)}`); break }
  if (solver.currentPipelineStepIndex !== before) {
    console.log(`PHASE ${label} stage ${solver.pipelineDef[before]?.solverName} ${((Date.now() - stageStarted) / 1000).toFixed(1)}s`)
    stageStarted = Date.now()
  }
}
const chain: string[] = []
let node: any = solver
for (let depth = 0; node && depth < 12; depth++) {
  chain.push(`${node.constructor?.name}${node.failed ? "(failed)" : ""}${node.error ? `: ${String(node.error).slice(0, 160)}` : ""}`)
  node = node.activeSubSolver
}
const stepName = solver.pipelineDef[solver.currentPipelineStepIndex]?.solverName
const current = solver[stepName]
console.log(`PHASE ${label} solved=${solver.solved} failed=${solver.failed} seconds=${((Date.now() - started) / 1000).toFixed(1)} connections=${input.connections.length} obstacles=${input.obstacles.length} traces=${input.traces?.length ?? 0} layers=${input.layerCount}`)
console.log(`PHASE ${label} error=${String(solver.error).slice(0, 400)}`)
console.log(`PHASE ${label} failingStage=${stepName} stageError=${String(current?.error).slice(0, 300)} stageStats=${JSON.stringify(current?.stats ?? {}).slice(0, 500)}`)
console.log(`PHASE ${label} chain=${chain.join(" > ")}`)
