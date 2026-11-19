// Diagnostic only; never part of a PR. Dumps raw DRC error objects for small contact cases.
import { createPipeline9AutoroutingDrcEvaluator } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/createPipeline9AutoroutingDrcEvaluator"
const pad = (id: string, net: string, x: number, y: number) => ({ type: "rect", layers: ["top"], center: { x, y }, width: 0.4, height: 0.4, connectedTo: [net, id], obstacleId: id })
const srj: any = {
  layerCount: 2, minTraceWidth: 0.1, defaultObstacleMargin: 0.1,
  bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  obstacles: [pad("padA1", "netA", -3, 0), pad("padA2", "netA", 3, 0), pad("padB1", "netB", -3, 1), pad("padB2", "netB", 3, 1), pad("padC1", "netC", 0, -2), pad("padC2", "netC", 0, 2)],
  connections: [
    { name: "netA", pointsToConnect: [{ x: -3, y: 0, layer: "top", pcb_port_id: "padA1" }, { x: 3, y: 0, layer: "top", pcb_port_id: "padA2" }] },
    { name: "netB", pointsToConnect: [{ x: -3, y: 1, layer: "top", pcb_port_id: "padB1" }, { x: 3, y: 1, layer: "top", pcb_port_id: "padB2" }] },
    { name: "netC", pointsToConnect: [{ x: 0, y: -2, layer: "top", pcb_port_id: "padC1" }, { x: 0, y: 2, layer: "top", pcb_port_id: "padC2" }] },
  ],
}
const wire = (x: number, y: number, layer = "top") => ({ route_type: "wire", x, y, width: 0.15, layer })
const trace = (id: string, net: string, route: any[]) => ({ type: "pcb_trace", pcb_trace_id: id, connection_name: net, route })
const cases: Record<string, any[]> = {
  traceOnTrace: [trace("tA", "netA", [wire(-3, 0), wire(3, 0)]), trace("tB", "netB", [wire(-3, 1), wire(-1, 1), wire(-1, 0.05), wire(1, 0.05), wire(1, 1), wire(3, 1)])],
  traceOnPad: [trace("tA", "netA", [wire(-3, 0), wire(3, 0)]), trace("tB", "netB", [wire(-3, 1), wire(-3.1, 0.3), wire(3, 1)])],
  traceOnVia: [trace("tA", "netA", [wire(-3, 0), wire(0, 0), { route_type: "via", x: 0, y: 0, from_layer: "top", to_layer: "bottom", via_diameter: 0.3, hole_diameter: 0.15 }, wire(0, 0, "bottom"), wire(3, 0, "bottom"), { route_type: "via", x: 3, y: 0, from_layer: "bottom", to_layer: "top", via_diameter: 0.3, hole_diameter: 0.15 }, wire(3, 0)]), trace("tB", "netB", [wire(-3, 1), wire(-0.1, 1), wire(-0.1, 0.1), wire(0.1, 0.1), wire(0.1, 1), wire(3, 1)])],
  nearMiss: [trace("tA", "netA", [wire(-3, 0), wire(3, 0)]), trace("tB", "netB", [wire(-3, 1), wire(-1, 1), wire(-1, 0.2), wire(1, 0.2), wire(1, 1), wire(3, 1)])],
}
const evaluate = createPipeline9AutoroutingDrcEvaluator({ inputSrj: srj, srjWithPointPairs: srj })
for (const [name, traces] of Object.entries(cases)) {
  const result: any = evaluate(traces as any)
  const errs = result.errorsWithCenters ?? result.errors
  console.log(`CASE ${name} errors=${errs.length}`)
  for (const e of errs) console.log(`CASE ${name}   ${JSON.stringify(e)}`)
}
