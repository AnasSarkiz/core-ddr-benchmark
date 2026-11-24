import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { Pipeline9RegionalB01RepairSolver } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9RegionalB01RepairSolver"
import { getSegmentToObstacleDistance } from "lib/utils/getSegmentToObstacleDistance"
import type { SimpleRouteJson } from "lib/types"

const [fixturePath, label] = process.argv.slice(2)
const input: SimpleRouteJson = JSON.parse(gunzipSync(new Uint8Array(readFileSync(fixturePath))).toString("utf8"))
const clearance = input.minViaEdgeToPadEdgeClearance ?? 0.1
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, { cacheProvider: null })
const viaRadius = solver.viaDiameter / 2

type Tight = { key: string; net: string; x: number; y: number; clr: number }
const getTightVias = (routes: any[] | undefined): Tight[] => {
  const out: Tight[] = []
  if (!routes) return out
  const connMap = solver.connMap
  for (const route of routes) {
    const routeNet = connMap?.getNetConnectedToId(route.connectionName) ?? route.connectionName
    for (const via of route.vias ?? []) {
      let best = Infinity
      for (const o of input.obstacles) {
        const ids = [o.obstacleId, ...(o.connectedTo ?? [])].filter(Boolean)
        if (ids.some((id) => connMap?.getNetConnectedToId(id) === routeNet)) continue
        if (Math.abs(o.center.x - via.x) > 2 || Math.abs(o.center.y - via.y) > 2) continue
        best = Math.min(best, getSegmentToObstacleDistance({ start: via, end: via, obstacle: o }) - viaRadius)
      }
      if (best < clearance - 1e-6) out.push({ key: `${route.connectionName}@${via.x.toFixed(3)},${via.y.toFixed(3)}`, net: route.connectionName, x: via.x, y: via.y, clr: best })
    }
  }
  return out
}

const proto: any = Pipeline9RegionalB01RepairSolver.prototype
const originalStep = proto._step
let instance = 0
proto._step = function (this: any) {
  if (this.__diagId === undefined) {
    this.__diagId = instance++
    this.__diagKeys = new Set(getTightVias(this.bestRoutes).map((v) => v.key))
    console.log(`JOINT b01#${this.__diagId} start routes=${this.bestRoutes?.length} tight=${[...this.__diagKeys].join(" ")}`)
  }
  const phaseBefore = this.phase
  const bestBefore = this.bestRoutes
  const cleanupBefore = this.cleanup?.routes
  const errorsBefore = this.bestErrors?.length ?? this.cleanup?.errors?.length
  originalStep.call(this)
  const candidates: Array<[string, any[] | undefined, number | undefined]> = []
  if (this.bestRoutes !== bestBefore) candidates.push(["bestRoutes", this.bestRoutes, this.bestErrors?.length])
  if (this.cleanup?.routes && this.cleanup.routes !== cleanupBefore) candidates.push(["cleanup.routes", this.cleanup.routes, this.cleanup.errors?.length])
  for (const [field, routes, errorsAfter] of candidates) {
    const tight = getTightVias(routes)
    const added = tight.filter((v) => !this.__diagKeys.has(v.key))
    const removed = [...this.__diagKeys].filter((k: string) => !tight.some((v) => v.key === k))
    if (added.length || removed.length) {
      console.log(`JOINT b01#${this.__diagId} phase=${phaseBefore}->${this.phase} ${field} errors ${errorsBefore}->${errorsAfter} added=${added.map((v) => `${v.key}(clr=${v.clr.toFixed(3)})`).join(" ")} removed=${removed.join(" ")}`)
    }
    this.__diagKeys = new Set(tight.map((v) => v.key))
  }
}

let guard = 0
while (!solver.solved && !solver.failed && guard++ < 50_000_000) {
  const before = solver.currentPipelineStepIndex
  solver.step()
  if (solver.currentPipelineStepIndex !== before) {
    const name = solver.pipelineDef[before]?.solverName
    if (/Joint|Regional|Repair|Cleanup/i.test(name ?? "")) console.log(`JOINT stage done ${name}`)
  }
}
console.log(`JOINT ${label} done solved=${solver.solved} clearance=${clearance}`)
