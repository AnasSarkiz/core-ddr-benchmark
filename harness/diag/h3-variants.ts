// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout
// on the H3 repro branch. Routes H3 byte 1 under request variants and counts
// the pads of later connections left without an escape.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const { BusLanesPipelineSolver } = await import(resolve(process.cwd(), "lib/index.ts"))
const { getPadEscape } = await import(resolve(process.cwd(), "tests/fixtures/pad-escapes.ts"))
const fixture = JSON.parse(
  gunzipSync(readFileSync("tests/fixtures/h3-pending-pad-escapes/input.json.gz")).toString("utf8"),
)
const pads = (input: any) =>
  fixture.pendingConnections.flatMap((connection: any) =>
    [0, 1].map((end) => ({
      port: connection.pointsToConnect[end].pcb_port_id,
      escape: getPadEscape({ input, connection, end, viaTargetLayer: "bottom" }),
    })),
  )
const length = (trace: any) =>
  trace.route.slice(1).reduce((sum: number, p: any, i: number) => sum + Math.hypot(p.x - trace.route[i].x, p.y - trace.route[i].y), 0)
const base = fixture.byte1Request
const before = pads(base)
const variants: [string, any][] = [Number(process.argv[2])].map((maxLength) => [
  `maxLength-${maxLength}`,
  { ...base, buses: base.buses.map((bus: any) => ({ ...bus, maxLength })) },
])
for (const [name, input] of variants) {
  const started = performance.now()
  const solver = new BusLanesPipelineSolver(input)
  let last = ""
  try {
    while (!solver.solved && !solver.failed && performance.now() - started < 420_000) {
      solver.step()
      if (solver.phase !== last) {
        last = solver.phase
        console.log(`PHASE ${name} t=${((performance.now() - started) / 1000).toFixed(1)}s ${solver.phase}`)
      }
    }
  } catch (error) {
    console.log(`VARIANT ${name} threw ${String(error).slice(0, 300)}`)
    continue
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  if (!solver.solved) {
    console.log(`VARIANT ${name} solved=false failed=${solver.failed} error=${solver.error} phase=${solver.phase} iterations=${solver.iterations} t=${seconds}s`)
    continue
  }
  const traces = solver.getOutput().traces
  const fresh = traces.slice(base.traces.length)
  const after = pads({ ...base, traces })
  const trapped = after.filter((pad: any, index: number) => before[index].escape && !pad.escape).map((pad: any) => pad.port)
  console.log(
    `VARIANT ${name} solved=true t=${seconds}s trapped=${trapped.length} [${trapped.join(",")}] ` +
      fresh.map((t: any) => `${t.connection_name}:${length(t).toFixed(1)}mm/${t.route.filter((p: any) => p.route_type === "via").length}v`).join(" "),
  )
}
