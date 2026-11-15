// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout
// on the H3 repro branch. Asks the generated-via-site strategy, which the
// pipeline only tries after the surface fallback fails, to route H3 byte 1.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const lib = (name: string) => import(resolve(process.cwd(), "lib", name))
const { routeGeneratedSignalSites } = await lib("route-generated-signal-sites.ts")
const { withInferredSurfaceLayers } = await lib("effective-carrier-layers.ts")
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
for (const [name, input] of [
  ["raw", base],
  ["inferred", withInferredSurfaceLayers(base)],
] as [string, any][]) {
  const started = performance.now()
  let steps = 0
  let result: any = null
  try {
    const generator = routeGeneratedSignalSites({
      input,
      options: { smoothTuning: true, denseSearch: true },
      maxSteps: 5_000_000,
    })
    let state = generator.next()
    while (!state.done) {
      steps++
      state = generator.next()
    }
    result = state.value
  } catch (error) {
    console.log(`GENERATED ${name} threw ${String(error).slice(0, 400)}`)
    continue
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  if (!result) {
    console.log(`GENERATED ${name} null after ${steps} steps t=${seconds}s allowedLayers=${JSON.stringify(input.allowedLayers)}`)
    continue
  }
  const traces = [...base.traces, ...result.traces]
  const after = pads({ ...base, traces })
  const trapped = after.filter((pad: any, index: number) => before[index].escape && !pad.escape).map((pad: any) => pad.port)
  console.log(
    `GENERATED ${name} routed=${result.traces.length} steps=${steps} t=${seconds}s trapped=${trapped.length} [${trapped.join(",")}] ` +
      result.traces.map((t: any) => `${t.connection_name}:${length(t).toFixed(1)}mm/${t.route.filter((p: any) => p.route_type === "via").length}v`).join(" "),
  )
}
