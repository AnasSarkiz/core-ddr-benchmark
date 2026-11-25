// Diagnostic only; never part of a PR. Writes the BGA escape solver input that
// Pipeline 9 builds for a phase SRJ.
import { readFileSync, writeFileSync } from "node:fs"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, outPath] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath!, "utf8"))
const pipeline: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(raw.simpleRouteJson ?? raw, { cacheProvider: null })
while (!pipeline.solved && !pipeline.failed && !pipeline.highDensityRouteSolver?.bgaEscapeAttempt) pipeline.step()
const solver = pipeline.highDensityRouteSolver.bgaEscapeAttempt.solver
const [input] = solver.getConstructorParams()
writeFileSync(outPath!, JSON.stringify(input))
console.log(`BGA input connections=${input.board.connections.length} pointPairs=${input.pointPairs.length} obstacles=${input.board.obstacles.length} fixedTraces=${input.board.fixedTraces.length} signal=${input.signalLayers} bytes=${JSON.stringify(input).length}`)
