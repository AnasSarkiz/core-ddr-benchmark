// Diagnostic only; never part of a PR. Runs Pipeline 9 on a phase SRJ until the
// BGA escape strategy fails, then asks whether the failing pair is reachable
// before any earlier BGA net is routed (ordering) or not at all (fixed copper
// and reserved escapes). Writes the failing state as GraphicsObject JSON.
import { readFileSync, writeFileSync } from "node:fs"
import { BgaEscapeRoutingSolver } from "@tscircuit/bga-escape-routing-solver"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"

const [srjPath, outPath] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(srjPath!, "utf8"))
const input = raw.simpleRouteJson ?? raw
const pipeline: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
while (!pipeline.solved && !pipeline.failed) pipeline.step()
const hd: any = pipeline.highDensityRouteSolver
const failed: any = hd?.bgaEscapeAttempt?.solver
console.log(`BGA pipelineError=${String(pipeline.error).slice(0, 300)}`)
if (!failed) process.exit(0)
const grid = failed.copper.grid
console.log(`BGA grid ${grid.columns}x${grid.rows}x${grid.layerCount} step=${grid.step} signal=${grid.signalLayers} inner=${grid.innerSignalLayers}`)
console.log(`BGA failedAtNet=${failed.netIndex}/${failed.nets.length} pair=${failed.pairIndex}/${failed.pairs.length} routes=${failed.routes.length} failure=${failed.failure}`)
const failingNet = failed.nets[failed.netIndex]
console.log(`BGA failingNet=${failingNet.connection.name} span=${failingNet.span.toFixed(2)} terminals=${failingNet.terminals.map((t: any) => `${t.terminalId}@${t.point.layer}(${t.point.x.toFixed(2)},${t.point.y.toFixed(2)})`).join(" ")}`)
console.log(`BGA earlierNets=${failed.nets.slice(0, failed.netIndex).map((n: any) => n.connection.name).join(",")}`)
writeFileSync(outPath!, JSON.stringify(failed.visualize()))

// Same input, but route the failing net first.
const fresh: any = new BgaEscapeRoutingSolver(failed.input)
while (fresh.stage !== "route_connections" && !fresh.failed) fresh.step()
const index = fresh.nets.findIndex((n: any) => n.connection.name === failingNet.connection.name)
const [moved] = fresh.nets.splice(index, 1)
fresh.nets.unshift(moved)
while (!fresh.failed && fresh.netIndex === 0) fresh.step()
console.log(`BGA failingNetFirst failed=${fresh.failed} error=${String(fresh.error).slice(0, 200)} routes=${fresh.routes.length}`)

// Per inner layer reachability of the failing pair with only fixed copper and escapes.
const pairs = failed.pairs.length ? failed.pairs : []
const pair = pairs[failed.pairIndex]
const empty: any = new BgaEscapeRoutingSolver(failed.input)
while (empty.stage !== "route_connections" && !empty.failed) empty.step()
if (pair) {
  for (const layer of grid.innerSignalLayers) {
    const s: any = new (empty.search.constructor as any)(empty.copper)
    s.start({ start: layer * grid.layerSize + pair.start.viaSite, end: layer * grid.layerSize + pair.end.viaSite, owner: pair.start.owner, width: pair.start.width })
    while (s.active && !s.failure) s.step()
    console.log(`BGA pairOnEmptyFromLayer${layer} path=${s.path?.length ?? 0} failure=${s.failure ?? "none"}`)
  }
}
