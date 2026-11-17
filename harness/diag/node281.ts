// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Why does splitting cmn_281 on H616 raise relaxed DRC errors? Geometry, port points, error locations.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
const label = process.argv[2]
const ids = ["cmn_281", "topology_merge_931"]
const fixture = JSON.parse(gunzipSync(readFileSync("tests/fixtures/assets/h616-full-board-ddr-clearance.json.gz")).toString("utf8"))
const s: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(fixture.inputSrj, { cacheProvider: null })
while (!s.solved && !s.failed && s.getCurrentPhase() !== "edgeSolver") s.step()
const merged = s.topologyMergingSolver.getOutput()
const boxes: Record<string, any> = {}
for (const id of ids) {
  const n = merged.find((m: any) => m.capacityMeshNodeId === id)
  boxes[id] = { minX: n.center.x - n.width / 2, maxX: n.center.x + n.width / 2, minY: n.center.y - n.height / 2, maxY: n.center.y + n.height / 2 }
  console.log(`N281 ${label} NODE ${id} c=(${n.center.x.toFixed(3)},${n.center.y.toFixed(3)}) ${n.width.toFixed(3)}x${n.height.toFixed(3)} z=${JSON.stringify(n.availableZ)} children=${s.capacityNodes.filter((c: any) => c.capacityMeshNodeId.startsWith(id)).map((c: any) => c.capacityMeshNodeId + JSON.stringify(c.availableZ)).join(" ")}`)
  const b = boxes[id]
  const near = fixture.inputSrj.obstacles.filter((o: any) => Math.abs(o.center.x - (b.minX + b.maxX) / 2) < o.width / 2 + (b.maxX - b.minX) / 2 + 0.4 && Math.abs(o.center.y - (b.minY + b.maxY) / 2) < o.height / 2 + (b.maxY - b.minY) / 2 + 0.4)
  for (const o of near.slice(0, 12)) console.log(`N281 ${label}   OBST ${o.type} c=(${o.center.x.toFixed(3)},${o.center.y.toFixed(3)}) ${o.width.toFixed(3)}x${o.height.toFixed(3)} layers=${o.layers} conn=${JSON.stringify(o.connectedTo ?? []).slice(0, 80)}`)
  const neighborEdges = s.capacityNodes.filter((c: any) => c.capacityMeshNodeId.startsWith(id))
  void neighborEdges
}
s.solve()
const pp = s.portPointPathingSolver
const nodesWithPortPoints = pp?.getOutput?.()?.nodesWithPortPoints ?? s.portPointPathingSolver?.nodesWithPortPoints ?? []
for (const id of ids) {
  const list = nodesWithPortPoints.filter((x: any) => x.capacityMeshNodeId.startsWith(id))
  for (const x of list) console.log(`N281 ${label} PP ${x.capacityMeshNodeId} ${JSON.stringify(x.portPoints.map((p: any) => [p.connectionName, p.z, +p.x.toFixed(2), +p.y.toFixed(2)]))}`.slice(0, 1200))
}
const referenceSrj = { ...fixture.inputSrj, obstacles: fixture.nativeObstacles, connections: [...fixture.preloadedConnections, ...fixture.inputSrj.connections], traces: fixture.preloadedTraces }
const result: any = evaluateRelaxedDrc({
  inputSrj: referenceSrj,
  srjWithPointPairs: { ...s.srjWithPointPairs, connections: [...fixture.preloadedConnections, ...s.srjWithPointPairs.connections] },
  routedTraces: s.getOutputSimplifiedPcbTraces(),
  drcOptions: { traceClearance: 0.1, viaToPadClearance: 0.1 },
})
const b = boxes.cmn_281
const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
const buckets: Record<string, number> = {}
for (const e of result.errorsWithCenters ?? []) {
  const d = Math.hypot(e.center.x - cx, e.center.y - cy)
  const k = d < 1 ? "<1mm" : d < 3 ? "<3mm" : d < 10 ? "<10mm" : ">=10mm"
  buckets[k] = (buckets[k] ?? 0) + 1
}
console.log(`N281 ${label} errors=${result.errors.length} distFrom281=${JSON.stringify(buckets)}`)
for (const e of (result.errorsWithCenters ?? []).slice(0, 200)) console.log(`N281 ${label} ERR ${e.error?.type ?? e.type} (${e.center.x.toFixed(2)},${e.center.y.toFixed(2)}) ${(e.error?.message ?? e.message ?? "").slice(0, 110)}`)
