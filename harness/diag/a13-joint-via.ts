import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { Pipeline9RegionalB01RepairSolver } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9RegionalB01RepairSolver"
import { Pipeline9JointDrcRepairSolver } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/Pipeline9JointDrcRepairSolver"
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

const jointProto: any = Pipeline9JointDrcRepairSolver.prototype
const jointStep = jointProto._step
const childFields = ["clearanceProjectionSolver", "initialBoundedRegionalRepairSolver", "exactRepairSolver", "regionalB01RepairSolver", "boundedRegionalRepairSolver", "traceContactRepairSolver"]
jointProto._step = function (this: any) {
  const active = (): string => childFields.filter((f) => this[f] && !this[f].solved && !this[f].failed).join("+") || "-"
  const before = active()
  jointStep.call(this)
  const after = active()
  if (before === after && !this.solved) return
  let routes: any[] | undefined
  try { routes = this.getCombinedOutput() } catch { routes = undefined }
  const tight = getTightVias(routes)
  const keys = new Set(tight.map((v) => v.key))
  const prev: Set<string> = this.__diagKeys ?? new Set()
  const added = tight.filter((v) => !prev.has(v.key))
  const removed = [...prev].filter((k) => !keys.has(k))
  const fields = childFields.filter((f) => this[f]).map((f) => `${f}${this[f].solved ? ":solved" : this[f].failed ? ":failed" : ""}`).join(",")
  console.log(`JOINT step ${before} -> ${after} solved=${this.solved} routes=${routes?.length} added=${added.map((v) => `${v.key}(clr=${v.clr.toFixed(3)})`).join(" ")} removed=${removed.join(" ")} children=${fields}`)
  this.__diagKeys = keys
  const tcr = this.traceContactRepairSolver
  if (tcr?.solved && !tcr.__diagDone) {
    tcr.__diagDone = true
    const describe = (e: any): string => `${e.type}:${String(e.message ?? "").replace(/\s+/g, " ").slice(0, 110)}`
    const input = tcr.snapshot(tcr.params.inputHdRoutes)
    const entering = tcr.snapshot(tcr.params.hdRoutes)
    const output = tcr.snapshot(tcr.getOutput())
    console.log(`JOINT tcr counts input=${input.count} entering=${entering.count} output=${output.count} accepted=${tcr.stats?.traceContactRepairAccepted} contactsEntering=${JSON.stringify(tcr.guard.getNewContactPairs(tcr.params.hdRoutes))}`)
    const key = (e: any): string => describe(e).replace(/[0-9.]+mm/g, "")
    const enteringKeys = entering.errors.map(key)
    const outputKeys = output.errors.map(key)
    for (const e of output.errors) if (!enteringKeys.includes(key(e))) console.log(`JOINT tcr added ${describe(e)}`)
    for (const e of entering.errors) if (!outputKeys.includes(key(e))) console.log(`JOINT tcr removed ${describe(e)}`)
    // Try moving net_77's via to every nearby spot that keeps the pad clearance.
    const target = { x: -6.688, y: -1.736 }
    const outRoutes: any[] = tcr.getOutput()
    const routeIndex = outRoutes.findIndex((r) => r.connectionName.startsWith("source_net_77") && (r.vias ?? []).some((v: any) => Math.hypot(v.x - target.x, v.y - target.y) < 0.01))
    console.log(`JOINT spot routeIndex=${routeIndex} conn=${outRoutes[routeIndex]?.connectionName} vias=${JSON.stringify(outRoutes[routeIndex]?.vias)}`)
    if (routeIndex >= 0) {
      const route = outRoutes[routeIndex]
      const via = route.vias.find((v: any) => Math.hypot(v.x - target.x, v.y - target.y) < 0.01)
      const padClearanceAt = (x: number, y: number): number => getTightVias([{ ...route, vias: [{ x, y }] }])[0]?.clr ?? Infinity
      const baseline = output.count
      const spots: Array<{ x: number; y: number; d: number; padClr: number }> = []
      for (let dx = -0.6; dx <= 0.6001; dx += 0.025) for (let dy = -0.6; dy <= 0.6001; dy += 0.025) {
        const x = via.x + dx
        const y = via.y + dy
        const padClr = padClearanceAt(x, y)
        if (padClr >= clearance) spots.push({ x, y, d: Math.hypot(dx, dy), padClr })
      }
      spots.sort((a, b) => a.d - b.d)
      console.log(`JOINT spot padClearSpots=${spots.length} nearestPadClear=${spots[0] ? `${spots[0].d.toFixed(3)}mm` : "none"} baselineCount=${baseline}`)
      let evaluated = 0
      let found = 0
      for (const spot of spots) {
        if (evaluated >= 160) break
        const moved = {
          ...route,
          vias: route.vias.map((v: any) => (v === via ? { ...v, x: spot.x, y: spot.y } : v)),
          route: route.route.map((p: any) => (Math.hypot(p.x - via.x, p.y - via.y) < 1e-6 ? { ...p, x: spot.x, y: spot.y } : p)),
        }
        const routes = outRoutes.map((r, i) => (i === routeIndex ? moved : r))
        evaluated++
        if (tcr.inputContactGuard.getNewContactPairs(routes).length > 0) continue
        const snap = tcr.snapshot(routes)
        const viaPad = snap.errors.filter((e: any) => String(e.message).includes("via_") && String(e.message).includes("smtpad")).length
        if (snap.count <= baseline) {
          found++
          if (found <= 8) console.log(`JOINT spot candidate d=${spot.d.toFixed(3)} at (${spot.x.toFixed(3)},${spot.y.toFixed(3)}) padClr=${spot.padClr.toFixed(3)} count=${snap.count} (baseline ${baseline}) viaPadErrors=${viaPad}`)
        }
      }
      console.log(`JOINT spot evaluated=${evaluated} contactFreeNotWorse=${found}`)
    }
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
