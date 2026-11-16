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
const { negotiateSignalSites } = await lib("negotiate-signal-sites.ts")
const { finishGeneratedSurfaceCarriers } = await lib("finish-generated-surface-carriers.ts")
const configurations: [string, any][] = [
  ["expand-all", { expandEmptyDomainsOnly: false, allowPadEdgeSites: false }],
  ["expand-all-pad-edge", { expandEmptyDomainsOnly: false, allowPadEdgeSites: true }],
]
for (const [name, extra] of configurations) {
  const input = base
  const started = performance.now()
  let result: any = null
  try {
    const negotiation = negotiateSignalSites(
      { native: input, pending: input, escapes: [], retained: [], traces: [] },
      new Set(input.connections.map((connection: any) => connection.name)),
      false,
      true,
      { checkEscapeCompatibility: true, allowExpandedSites: true, maxCandidateSearchNodes: 12000, ...extra },
    )
    let state = negotiation.next()
    while (!state.done && performance.now() - started < 400_000) state = negotiation.next()
    const routed = state.done ? state.value : null
    console.log(`GENERATED ${name} negotiation ${routed ? `routed ${routed.traces.length} carriers ${routed.escapes.length} escapes` : state.done ? "null" : "timeout"} t=${((performance.now() - started) / 1000).toFixed(1)}s`)
    if (routed) {
      for (const t of routed.traces) console.log(`CARRIER ${name} ${t.connection_name} layer=${t.route[0].layer} length=${length(t).toFixed(1)}`)
      const finishing = finishGeneratedSurfaceCarriers({ input, carriers: routed.traces, escapes: routed.escapes, options: { smoothTuning: true, denseSearch: true }, maxSteps: 5_000_000 })
      let step = finishing.next()
      while (!step.done && performance.now() - started < 800_000) step = finishing.next()
      result = step.done ? step.value : null
      if (!result) console.log(`GENERATED ${name} finishing ${step.done ? "null" : "timeout"}`)
    }
  } catch (error) {
    console.log(`GENERATED ${name} threw ${String(error).slice(0, 400)}`)
    continue
  }
  if (!result) continue
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const traces = [...base.traces, ...result.traces]
  const after = pads({ ...base, traces })
  const trapped = after.filter((pad: any, index: number) => before[index].escape && !pad.escape).map((pad: any) => pad.port)
  console.log(
    `GENERATED ${name} routed=${result.traces.length} t=${seconds}s trapped=${trapped.length} [${trapped.join(",")}] ` +
      result.traces.map((t: any) => `${t.connection_name}:${length(t).toFixed(1)}mm/${t.route.filter((p: any) => p.route_type === "via").length}v`).join(" "),
  )
}
