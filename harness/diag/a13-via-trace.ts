import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { getSegmentToObstacleDistance } from "lib/utils/getSegmentToObstacleDistance"
import type { SimpleRouteJson } from "lib/types"
import { HighDensitySolver } from "lib/solvers/HighDensitySolver/HighDensitySolver"
import { hasPipeline9ViaToBoardObstacleConflict, isPipeline9ObstacleConnectedToRoute } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/hasPipeline9ViaToBoardObstacleConflict"
import { materializePipeline9HdRouteVias } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/materializePipeline9HdRouteVias"
import { getPipeline9RouteCopperGeometry } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/pipeline9FixedRouteCopper"

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

const diagValidated = { count: 0 }
const proto: any = HighDensitySolver.prototype
const original = proto.recordNodeSolveMetadata
proto.recordNodeSolveMetadata = function (this: any, nodeSolver: any, status: string) {
  original.call(this, nodeSolver, status)
  if (nodeSolver.stats?.candidateRejections || this.growShrinkSolutionValidator) diagValidated.count++
  const node = nodeSolver.nodeWithPortPoints
  if (node.capacityMeshNodeId === "topology_merge_24641" || node.capacityMeshNodeId === "topology_merge_20656") {
    const routes = materializePipeline9HdRouteVias(nodeSolver.solvedRoutes)
    const pads = (this.obstacles as any[]).filter((o) => Math.abs(o.center.x - node.center.x) < 1 && Math.abs(o.center.y - node.center.y) < 1)
    const conflict = hasPipeline9ViaToBoardObstacleConflict({ routes, boardObstacles: pads, connMap: this.connMap, layerCount: this.layerCount, viaToPadClearance: 0.1249 })
    console.log(`DEBUG validatorSrc=${String(this.growShrinkSolutionValidator).replace(/\s+/g, ' ').slice(0, 160)} hdObstacles=${(this.obstacles ?? []).length} solverName=${this.getSolverName?.()} status=${status} winner=${nodeSolver.winningSolver?.constructor?.name}`)
    console.log(`DEBUG node=${node.capacityMeshNodeId} validatorSet=${Boolean(this.growShrinkSolutionValidator)} validatorSays=${this.growShrinkSolutionValidator?.(nodeSolver.solvedRoutes)} manualConflict=${conflict} pads=${pads.length} rejections=${JSON.stringify(nodeSolver.winningSolver?.stats?.candidateRejections ?? nodeSolver.stats?.candidateRejections)}`)
    for (const route of routes) {
      const geo = getPipeline9RouteCopperGeometry(route, { layerCount: this.layerCount })
      console.log(`DEBUG   route ${route.connectionName} vias=${JSON.stringify(route.vias)} viaSpans=${JSON.stringify(geo.viaSpans)} points=${JSON.stringify(route.route.map((p: any) => [p.x.toFixed(2), p.y.toFixed(2), p.z]))}`)
      for (const o of pads) {
        const d = getSegmentToObstacleDistance({ start: geo.viaSpans[0]?.center ?? { x: 0, y: 0 }, end: geo.viaSpans[0]?.center ?? { x: 0, y: 0 }, obstacle: o })
        if (d < 0.5) console.log(`DEBUG     pad ${o.obstacleId} c=(${o.center.x.toFixed(3)},${o.center.y.toFixed(3)}) d=${d.toFixed(3)} connected=${isPipeline9ObstacleConnectedToRoute({ obstacle: o, route, connMap: this.connMap })} zLayers=${JSON.stringify(o.__zLayers ?? o.zLayers ?? o.layers)} connectedTo=${JSON.stringify(o.connectedTo).slice(0, 120)}`)
      }
    }
  }
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
    if (name === "highDensityRouteSolver") console.log(`TRACE hd viaToPadClearance=${sub?.viaToPadClearance} srjClearance=${solver.srj?.minViaEdgeToPadEdgeClearance} original=${solver.originalSrj?.minViaEdgeToPadEdgeClearance} stats=${JSON.stringify(sub?.stats ?? {}).slice(0, 400)}`)
  }
}
console.log(`TRACE nodesWithValidator=${diagValidated.count}`)
console.log(`TRACE done solved=${solver.solved} failed=${solver.failed}`)
report("final", solver.getOutputSimplifiedPcbTraces())
