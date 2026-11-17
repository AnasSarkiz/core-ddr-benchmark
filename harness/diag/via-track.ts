// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Routes a captured request and, at each stage change, reports vias drawn near
// a watched pad with their edge gap to that pad.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"

const srj = JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))
const watch = JSON.parse(process.env.WATCH!) as { x: number; y: number; w: number; h: number }[]
const rectGap = (cx: number, cy: number, r: number, p: { x: number; y: number; w: number; h: number }): number => {
  const dx = Math.max(Math.abs(cx - p.x) - p.w / 2, 0)
  const dy = Math.max(Math.abs(cy - p.y) - p.h / 2, 0)
  return Math.hypot(dx, dy) - r
}
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
const started = performance.now()
let last = ""
const report = (label: string): void => {
  let graphics: any
  try {
    graphics = solver.visualize()
  } catch (error) {
    console.log(`TRACK ${label} visualize threw ${String(error).slice(0, 120)}`)
    return
  }
  const found: string[] = []
  for (const circle of graphics.circles ?? []) {
    if (!circle.radius || circle.radius < 0.15 || circle.radius > 0.4) continue
    for (const pad of watch) {
      const gap = rectGap(circle.center.x, circle.center.y, circle.radius, pad)
      if (gap < 0.3) found.push(`(${circle.center.x.toFixed(3)},${circle.center.y.toFixed(3)}) r=${circle.radius} gap=${gap.toFixed(3)} ${String(circle.label ?? "").replace(/\s+/g, " ").slice(0, 80)}`)
    }
  }
  console.log(`TRACK ${label} t=${((performance.now() - started) / 1000).toFixed(1)}s vias-near=${found.length} ${found.join(" | ")}`)
}
while (!solver.solved && !solver.failed && performance.now() - started < 900_000) {
  solver.step()
  const phase = solver.getCurrentPhase()
  if (phase !== last) {
    report(`after:${last} now:${phase}`)
    last = phase
  }
}
report("final")
console.log(`RESULT solved=${solver.solved} failed=${solver.failed} error=${String(solver.error).slice(0, 300)}`)
if (solver.solved) {
  const routedTraces = solver.getOutputSimplifiedPcbTraces()
  const result = evaluateRelaxedDrc({
    inputSrj: srj,
    srjWithPointPairs: solver.srjWithPointPairs,
    routedTraces,
    drcOptions: { traceClearance: srj.minTraceToPadEdgeClearance },
  })
  console.log(`DRC declared total=${result.errorsWithCenters.length}`)
  for (const error of result.errorsWithCenters) console.log(`DRCERR ${error.type} @(${error.center?.x.toFixed(2)},${error.center?.y.toFixed(2)}) ${String(error.message).slice(0, 200)}`)
  for (const trace of routedTraces) {
    for (const point of trace.route) {
      if (point.route_type !== "via") continue
      for (const pad of watch) {
        const gap = rectGap(point.x, point.y, (trace as any).via_diameter ? (trace as any).via_diameter / 2 : 0.225, pad)
        if (gap < 0.3) console.log(`OUTVIA ${trace.pcb_trace_id} (${point.x.toFixed(3)},${point.y.toFixed(3)}) gap=${gap.toFixed(3)}`)
      }
    }
  }
}
