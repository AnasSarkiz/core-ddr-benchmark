// Diagnostic only; never part of a PR. Runs Pipeline 9 on a phase SRJ and, when
// high-density routing fails, writes the failing B01 node input and visual.
import { readFileSync, writeFileSync } from "node:fs"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, outDir] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath!, "utf8"))
const pipeline: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(raw.simpleRouteJson ?? raw, { cacheProvider: null })
while (!pipeline.solved && !pipeline.failed) pipeline.step()
console.log(`HD pipelineError=${String(pipeline.error).slice(0, 300)}`)
const hd: any = pipeline.highDensityRouteSolver
const failed: any = hd?.failedSolvers?.at(-1)
if (!failed) process.exit(0)
const [params] = failed.getConstructorParams?.() ?? [failed.params ?? failed.input]
writeFileSync(`${outDir}/b01-input.json`, JSON.stringify(params))
writeFileSync(`${outDir}/b01-visual.json`, JSON.stringify(failed.visualize()))
const node = params?.nodeWithPortPoints ?? params?.node
console.log(`HD b01Class=${failed.constructor.name} error=${String(failed.error).slice(0, 200)} node=${node?.capacityMeshNodeId} size=${node?.width?.toFixed?.(3)}x${node?.height?.toFixed?.(3)} z=${JSON.stringify(node?.availableZ)} portPoints=${node?.portPoints?.length} paramKeys=${Object.keys(params ?? {}).join(",")}`)
const nets = new Map<string, any[]>()
for (const p of node?.portPoints ?? []) nets.set(p.connectionName, [...(nets.get(p.connectionName) ?? []), p])
for (const [name, ps] of nets) console.log(`HD net ${name} ${ps.map((p: any) => `(${p.x.toFixed(3)},${p.y.toFixed(3)},z${p.z})`).join(" ")}`)
const fallback: any = hd?.activeFallbackSolver ?? hd?.lastFallbackSolver
console.log(`HD fixedObstacleRoutes=${params?.fixedObstacleRoutes?.length ?? params?.obstacleRoutes?.length ?? "?"}`)
