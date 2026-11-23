import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { getSegmentToObstacleDistance } from "lib/utils/getSegmentToObstacleDistance"
import type { SimpleRouteJson } from "lib/types"
import { HighDensitySolver } from "lib/solvers/HighDensitySolver/HighDensitySolver"

const input: SimpleRouteJson = JSON.parse(
  gunzipSync(new Uint8Array(readFileSync("tests/fixtures/assets/a13-via-without-site/remaining64.srj.json.gz"))).toString("utf8"),
)
const targets = [{ x: -6.69, y: -1.74 }, { x: 5.19, y: 5.84 }, { x: 7.03, y: 4.75 }]
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
const viaDiameter: number = solver.viaDiameter
console.log(`TRACE viaDiameter=${viaDiameter} clearance=${input.minViaEdgeToPadEdgeClearance}`)

const collectVias = (value: unknown, out: Array<{ x: number; y: number; path: string }>, path: string, depth: number, seen: Set<unknown>): void => {
  if (!value || typeof value !== "object" || depth > 7 || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectVias(item, out, `${path}[${i}]`, depth + 1, seen))
    return
  }
  const record = value as Record<string, unknown>
  if (record.route_type === "via" && typeof record.x === "number" && typeof record.y === "number") {
    out.push({ x: record.x, y: record.y, path })
    return
  }
  if (Array.isArray(record.vias)) {
    for (const via of record.vias as any[]) {
      const c = via?.center ?? via
      if (typeof c?.x === "number") out.push({ x: c.x, y: c.y, path: `${path}.vias(${String(record.connectionName ?? "")})` })
    }
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === "vias") continue
    collectVias(child, out, `${path}.${key}`, depth + 1, seen)
  }
}

const getForeign = () => {
  const connMap = solver.connMap
  const routed = new Set(input.connections.map((c) => connMap?.getNetConnectedToId(c.name) ?? c.name))
  return input.obstacles.filter((o) => ![o.obstacleId, ...(o.connectedTo ?? [])].some((id) => id && routed.has(connMap?.getNetConnectedToId(id))))
}

const report = (stage: string, output: unknown): void => {
  const vias: Array<{ x: number; y: number; path: string }> = []
  collectVias(output, vias, stage, 0, new Set())
  const foreign = getForeign()
  const near = vias.filter((v) => targets.some((t) => Math.hypot(v.x - t.x, v.y - t.y) < 0.35))
  const unique = new Map<string, (typeof near)[number]>()
  for (const v of near) unique.set(`${v.x.toFixed(3)},${v.y.toFixed(3)}`, v)
  console.log(`TRACE stage=${stage} vias=${vias.length} nearTargets=${unique.size}`)
  for (const v of unique.values()) {
    let best = Infinity
    let bestId = ""
    for (const o of foreign) {
      const d = getSegmentToObstacleDistance({ start: v, end: v, obstacle: o }) - viaDiameter / 2
      if (d < best) { best = d; bestId = o.obstacleId ?? "" }
    }
    console.log(`TRACE   via (${v.x.toFixed(3)},${v.y.toFixed(3)}) clr=${best.toFixed(3)} pad=${bestId} at ${v.path.slice(0, 140)}`)
  }
}

const proto: any = HighDensitySolver.prototype
const original = proto.recordNodeSolveMetadata
proto.recordNodeSolveMetadata = function (this: any, nodeSolver: any, status: string) {
  original.call(this, nodeSolver, status)
  const node = nodeSolver.nodeWithPortPoints
  const meta = this.nodeSolveMetadataById.get(node.capacityMeshNodeId)
  for (const route of nodeSolver.solvedRoutes ?? []) {
    for (const via of route.vias ?? []) {
      if (!targets.some((t) => Math.hypot(via.x - t.x, via.y - t.y) < 0.35)) continue
      const foreign = getForeign()
      let best = Infinity
      let bestPad: any
      for (const o of foreign) {
        const d = getSegmentToObstacleDistance({ start: via, end: via, obstacle: o }) - viaDiameter / 2
        if (d < best) { best = d; bestPad = o }
      }
      const inSolverObstacles = (this.obstacles ?? []).includes(bestPad)
      console.log(`NODE ${node.capacityMeshNodeId} solver=${meta?.solverType} status=${status} c=(${node.center.x.toFixed(3)},${node.center.y.toFixed(3)}) ${node.width.toFixed(3)}x${node.height.toFixed(3)} via=(${via.x.toFixed(3)},${via.y.toFixed(3)}) net=${route.connectionName} clr=${best.toFixed(3)} pad=(${bestPad?.center.x.toFixed(3)},${bestPad?.center.y.toFixed(3)} ${bestPad?.width}x${bestPad?.height} ${bestPad?.shape ?? "rect"}) obstaclesGiven=${(this.obstacles ?? []).length} padInObstacles=${inSolverObstacles} obstacleMargin=${this.obstacleMargin}`)
    }
  }
}

let guard = 0
while (!solver.solved && !solver.failed && guard++ < 50_000_000) {
  const before = solver.currentPipelineStepIndex
  solver.step()
  if (solver.currentPipelineStepIndex !== before) {
    const name = solver.pipelineDef[before]?.solverName
    const sub = solver[name]
    let output: unknown
    try { output = sub?.getOutput?.() } catch (e) { output = undefined; console.log(`TRACE stage=${name} getOutput threw ${(e as Error).message.slice(0, 80)}`) }
    report(name, output ?? sub)
  }
}
console.log(`TRACE done solved=${solver.solved} failed=${solver.failed}`)
report("final", solver.getOutputSimplifiedPcbTraces())
