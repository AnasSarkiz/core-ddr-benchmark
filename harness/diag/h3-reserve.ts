// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout
// on the H3 repro branch. Lazy reservations: route byte 1, find pads of later
// connections that lost their escape, reserve one via site for each as fixed
// copper of its own net, and route again.
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const lib = (name: string) => import(resolve(process.cwd(), "lib", name))
const { BusLanesPipelineSolver } = await lib("index.ts")
const { expandedSignalSites } = await lib("expanded-signal-sites.ts")
const { getPadEscape } = await import(resolve(process.cwd(), "tests/fixtures/pad-escapes.ts"))
const fixture = JSON.parse(
  gunzipSync(readFileSync("tests/fixtures/h3-pending-pad-escapes/input.json.gz")).toString("utf8"),
)
const base = fixture.byte1Request
const ends = fixture.pendingConnections.flatMap((connection: any) => [0, 1].map((end) => ({ connection, end, port: connection.pointsToConnect[end].pcb_port_id })))
const escapes = (input: any) => ends.map((e: any) => getPadEscape({ input, connection: e.connection, end: e.end, viaTargetLayer: "bottom" }))
const length = (trace: any) =>
  trace.route.slice(1).reduce((sum: number, p: any, i: number) => sum + Math.hypot(p.x - trace.route[i].x, p.y - trace.route[i].y), 0)
const before = escapes(base)
const names = new Set(base.connections.map((c: any) => c.name))
const reserved = new Map<string, any>()
const viaOf = (trace: any) => trace.route.find((p: any) => p.route_type === "via")
const spacing = base.minViaPadDiameter + base.minTraceToPadEdgeClearance
for (let iteration = 0; iteration < 8; iteration++) {
  const input = { ...base, traces: [...base.traces, ...reserved.values()] }
  const started = performance.now()
  const solver = new BusLanesPipelineSolver(input)
  try {
    while (!solver.solved && !solver.failed && performance.now() - started < 300_000) solver.step()
  } catch (error) {
    console.log(`RESERVE iteration=${iteration} threw ${String(error).slice(0, 300)}`)
    break
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  if (!solver.solved) {
    console.log(`RESERVE iteration=${iteration} reserved=${reserved.size} solved=false failed=${solver.failed} error=${solver.error} t=${seconds}s`)
    break
  }
  const fresh = solver.getOutput().traces.filter((t: any) => names.has(t.connection_name))
  const real = [...base.traces, ...fresh]
  const after = escapes({ ...base, traces: real })
  const trapped = ends.filter((_: any, index: number) => before[index] && !after[index])
  console.log(
    `RESERVE iteration=${iteration} reserved=${reserved.size} solved=true t=${seconds}s trapped=${trapped.length} [${trapped.map((e: any) => e.port).join(",")}] ` +
      fresh.map((t: any) => `${t.connection_name}:${length(t).toFixed(1)}mm/${t.route.filter((p: any) => p.route_type === "via").length}v`).join(" "),
  )
  if (!trapped.length) {
    writeFileSync("reserve-result.json", JSON.stringify({ traces: real, reserved: [...reserved.values()] }))
    console.log("RESERVE converged")
    break
  }
  let added = 0
  for (const { connection, end, port } of trapped) {
    if (reserved.has(port)) continue
    const search = expandedSignalSites({ input: { ...base, connections: [connection] }, connection, targetLayer: "bottom", allowPadEdgeSites: true })
    let state = search.next()
    while (!state.done) state = search.next()
    const site = state.value[end].find((candidate: any) => {
      const via = viaOf(candidate.escape)
      return via && [...reserved.values()].every((other) => {
        const otherVia = viaOf(other)
        return Math.hypot(via.x - otherVia.x, via.y - otherVia.y) >= spacing
      })
    })
    if (!site) {
      console.log(`RESERVE no free site for ${port}`)
      continue
    }
    reserved.set(port, { ...site.escape, pcb_trace_id: `reserved_${port}` })
    added++
  }
  if (!added) {
    console.log("RESERVE cannot add reservations")
    break
  }
}
