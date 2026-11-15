// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout:
//   BUS_LAYERS=bottom bun <harness>/diag/chain.ts <ram-byte0-request> <ram-byte1-request>
// Routes RAM byte 0, feeds its output into the RAM byte 1 request, routes that.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const { BusLanesPipelineSolver, BusLanesSolver } = await import(resolve(process.cwd(), "lib/index.ts"))
const { getSvgFromGraphicsObject } = await import("graphics-debug")
const read = (file: string) => JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")).input
const layers = process.env.BUS_LAYERS ? process.env.BUS_LAYERS.split(",") : undefined
const withLayers = (input: any) =>
  layers ? { ...input, buses: input.buses.map((bus: any) => ({ ...bus, allowedLayers: layers })) } : input
const describe = (traces: any[]) => {
  for (const t of traces) {
    let length = 0
    for (let i = 1; i < t.route.length; i++) length += Math.hypot(t.route[i].x - t.route[i - 1].x, t.route[i].y - t.route[i - 1].y)
    const vias = t.route.filter((p: any) => p.route_type === "via").length
    const used = [...new Set(t.route.filter((p: any) => p.route_type === "wire").map((p: any) => p.layer))]
    console.log(`    ${t.connection_name} length=${length.toFixed(2)} vias=${vias} layers=${used.join(",")}`)
  }
}
const solve = (label: string, input: any) => {
  const started = performance.now()
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  console.log(`${label}: solved=${solver.solved} failed=${solver.failed} error=${solver.error} failureCode=${solver.failureCode} iterations=${solver.iterations} ${((performance.now() - started) / 1000).toFixed(1)}s`)
  if (solver.solved) describe(solver.traces)
  return solver
}
console.log(`== chain BUS_LAYERS=${process.env.BUS_LAYERS ?? "(as captured)"} EXPERIMENT=${process.env.EXPERIMENT ?? "none"}`)
const first = withLayers(read(process.argv[2]))
const second = withLayers(read(process.argv[3]))
const byte0 = solve("ram_byte0", first)
if (byte0.solved) {
  // Core feeds the next phase the supplied copper plus the copper just routed.
  const chained = { ...second, traces: byte0.getOutput().traces }
  if (chained.traces.length !== second.traces.length) throw Error("Chained request has a different number of supplied traces")
  const byte1 = solve("ram_byte1 after the ram_byte0 above", chained)
  const shown = byte1.solved ? byte1.getOutput().traces : chained.traces
  const graphics = new BusLanesSolver({ ...chained, traces: shown }).visualize()
  writeFileSync("chain.svg", getSvgFromGraphicsObject(graphics, { backgroundColor: "white" }))
}
