// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout:
//   bun <harness>/diag/sites.ts <request.json.gz>
// Reports, per requested connection, how many local via sites each stage finds
// at the RAM ball (end 0) and at the resistor pad (end 1).
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const lib = (name: string) => import(resolve(process.cwd(), "lib", name))
const { negotiateSignalSites } = await lib("negotiate-signal-sites.ts")
const { expandedSignalSites, expandedSignalSiteChoices } = await lib("expanded-signal-sites.ts")
const { localSignalSiteCandidates } = await lib("reachable-signal-dogbones.ts")
const { withInferredSurfaceLayers } = await lib("effective-carrier-layers.ts")

const drain = <T,>(generator: Generator<void, T>): T => {
  let state = generator.next()
  while (!state.done) state = generator.next()
  return state.value
}
const { input: raw } = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString("utf8"))
const input = withInferredSurfaceLayers(raw)
console.log(`== ${process.argv[2]} allowedLayers=${JSON.stringify(input.allowedLayers)} supplied=${input.traces?.length ?? 0}`)
const targetLayers = new Map(input.connections.map((c: any) => [c.name, "bottom"]))
const options = {
  targetLayers,
  viaDiameter: input.minViaPadDiameter,
  viaHoleDiameter: input.minViaHoleDiameter,
  traceWidth: input.minTraceWidth,
  clearance: input.minTraceToPadEdgeClearance,
  boardEdgeClearance: input.minBoardEdgeClearance,
  holeToHoleClearance: input.minViaHoleEdgeToViaHoleEdgeClearance,
}
const offsets = (sites: any[], pad: any) =>
  sites.slice(0, 6).map((s) => `(${(s.point.x - pad.x).toFixed(3)},${(s.point.y - pad.y).toFixed(3)})`).join(" ")
for (const connection of input.connections) {
  const single = { ...input, connections: [connection] }
  const [ball, resistor] = connection.pointsToConnect
  let adjacent = "error"
  try {
    const sites = localSignalSiteCandidates(input, connection, options)
    adjacent = `${sites[0].length}/${sites[1].length} ball ${offsets(sites[0], ball)} resistor ${offsets(sites[1], resistor)}`
  } catch (error) {
    adjacent = `threw ${String(error).slice(0, 160)}`
  }
  console.log(`${connection.name} adjacent sites (ball/resistor): ${adjacent}`)
  for (const allowPadEdgeSites of [false, true]) {
    const started = performance.now()
    const ends = drain(expandedSignalSites({ input: single, connection, targetLayer: "bottom", allowPadEdgeSites }))
    const choices = drain(expandedSignalSiteChoices({ input: single, connection, targetLayer: "bottom", allowPadEdgeSites }))
    console.log(`  expanded padEdge=${allowPadEdgeSites}: ${ends[0].length}/${ends[1].length} sites, ${choices.length} joined choices, ${((performance.now() - started) / 1000).toFixed(1)}s; ball ${offsets(ends[0], ball)} resistor ${offsets(ends[1], resistor)}`)
  }
}
for (const allowPadEdgeSites of [false, true]) {
  const blocked: string[] = []
  const started = performance.now()
  const routed = drain(
    negotiateSignalSites(
      { native: input, pending: input, escapes: [], retained: [], traces: [] },
      new Set(input.connections.map((c: any) => c.name)),
      false,
      true,
      {
        checkEscapeCompatibility: true,
        allowExpandedSites: true,
        expandEmptyDomainsOnly: !allowPadEdgeSites,
        allowPadEdgeSites,
        maxCandidateSearchNodes: 12000,
        onBlockedConnection: (name: string) => blocked.push(name),
      },
    ),
  )
  console.log(`negotiate padEdge=${allowPadEdgeSites}: ${routed ? `routed ${routed.traces.length} carriers, ${routed.escapes.length} escapes` : "null"}; blocked=[${blocked.join(",")}] ${((performance.now() - started) / 1000).toFixed(1)}s`)
  if (routed)
    for (const trace of routed.traces as any[])
      console.log(`  ${trace.connection_name} layer=${trace.route[0].layer} points=${trace.route.length}`)
}
