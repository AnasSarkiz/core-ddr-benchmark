// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Reports which topology stage produced the capacity nodes under a point.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"

const srj = JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))
const point = JSON.parse(process.env.POINT!) as { x: number; y: number }
const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
while (!solver.solved && !solver.failed && solver.getCurrentPhase() !== "edgeSolver") solver.step()
const contains = (n: any): boolean =>
  Math.abs(n.center.x - point.x) <= n.width / 2 + 1e-6 && Math.abs(n.center.y - point.y) <= n.height / 2 + 1e-6
const describe = (label: string, n: any): void =>
  console.log(`ORIGIN ${label} id=${n.capacityMeshNodeId} center=(${n.center.x.toFixed(3)},${n.center.y.toFixed(3)}) size=${n.width.toFixed(3)}x${n.height.toFixed(3)} z=${JSON.stringify(n.availableZ)} extra=${JSON.stringify(Object.fromEntries(Object.entries(n).filter(([k]) => k.startsWith("_") || k.includes("component") || k.includes("source") || k.includes("merged")))).slice(0, 300)}`)
const components = solver.componentDetectionSolver?.getOutput?.()
for (const component of components?.components ?? components?.detectedComponents ?? []) {
  const members = component.memberObstacles ?? component.obstacles ?? []
  const near = members.some((o: any) => Math.hypot(o.center.x - point.x, o.center.y - point.y) < 1.5)
  if (near) console.log(`COMPONENT id=${component.componentId} kind=${component.kind ?? component.componentKind} members=${members.length} keys=${Object.keys(component).join(",")}`)
}
const topology = solver.topologyPlanningSolver?.getOutput()
for (const n of topology?.globalMeshNodes ?? []) if (contains(n)) describe("global", n)
;(topology?.componentMeshNodes ?? []).forEach((nodes: any[], index: number) => {
  for (const n of nodes) if (contains(n)) describe(`component-${index}`, n)
})
for (const n of solver.topologyMergingSolver?.getOutput?.() ?? []) if (contains(n)) describe("merged", n)
for (const n of solver.capacityNodes ?? []) if (contains(n)) describe("final", n)
console.log(`TOPOKEYS ${Object.keys(topology ?? {}).join(",")} componentsKeys=${Object.keys(components ?? {}).join(",")}`)
