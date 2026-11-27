import "bun-match-svg"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import {
  getCopperLayerNames,
  validateOriginalEndpointConnectivity,
  validateRoutedCopperDrc,
} from "@tscircuit/fanout-solver"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { BusLanesPipelineSolver, BusLanesSolver, busLengthReports } from "../../lib"
import { getConnectedPadGroups } from "../../lib/connected-pad-groups"
import { expandedSignalSites } from "../../lib/expanded-signal-sites"
import type { Obstacle, SimpleRouteJson, Trace } from "../../lib/types"

type PortPad = Obstacle & { circuitJsonMetadata?: { pcb_port_id?: string } }
type PendingPad = { pad: PortPad; port: string; net: string }

// ButterStick DDR3, Core's `matching` attempt: the request Core hands to the
// solver for the U11 address/command bus, with both completed byte phases
// supplied as traces. Board coordinates in mm, +X right, +Y up. The ECP5 is
// on the left, U11 (RAM0) top right and the second RAM bottom right.
const input = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../fixtures/butterstick-address-command-tuning.srj.json.gz",
        import.meta.url,
      ),
    ),
  ).toString(),
) as SimpleRouteJson & { traces: (Trace & { connection_name: string })[] }

/** Native pads of nets that join at least two ports but that this request
 * neither routes nor receives as copper: the remaining phase routes them. */
function getPendingPads(request: SimpleRouteJson): PendingPad[] {
  const assigned = new Set([
    ...request.connections.map((connection) => connection.name),
    ...request.traces!.map((trace) => trace.connection_name),
  ])
  return getConnectedPadGroups(
    request.obstacles.filter((pad) => pad.componentId),
  ).flatMap((group) => {
    const pads = [...group] as PortPad[]
    const aliases = [...new Set(pads.flatMap((pad) => pad.connectedTo))]
    const net = aliases.find((alias) => alias.startsWith("source_net_"))
    if (!net || pads.length < 2 || aliases.some((a) => assigned.has(a)))
      return []
    return pads.flatMap((pad) => {
      const port = pad.circuitJsonMetadata?.pcb_port_id
      return port ? [{ pad, port, net }] : []
    })
  })
}

/** How many via sites the solver's own site generator still finds for a
 * pad beside the copper in `request`. */
function countViaSites(request: SimpleRouteJson, pending: PendingPad): number {
  const point = {
    x: pending.pad.center.x,
    y: pending.pad.center.y,
    layer: pending.pad.layers[0],
    layers: pending.pad.layers,
    pcb_port_id: pending.port,
  }
  const connection = { name: pending.port, pointsToConnect: [point, point] }
  const search = expandedSignalSites({
    input: { ...request, connections: [connection] },
    connection,
    targetLayer: getCopperLayerNames(request.layerCount).at(-1)!,
  })
  let step = search.next()
  while (!step.done) step = search.next()
  return step.value[0].length
}

test("ButterStick address/command tuning takes the last via sites of two pending RAM pads", async (): Promise<void> => {
  const original = structuredClone(input)
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  expect(solver.error).toBeNull()
  expect(solver.solved).toBe(true)
  expect(input).toEqual(original)

  const traces = solver.getOutput().traces.map((trace) => {
    if (!trace.connection_name) throw Error("Completed DDR trace has no owner")
    return { ...trace, connection_name: trace.connection_name }
  })
  expect(traces.slice(0, input.traces.length)).toEqual(input.traces)
  const context = { inputSrj: input, routedSrj: { ...input, traces } }
  const connectivity = validateOriginalEndpointConnectivity(context)
  expect(connectivity.connectedConnectionCount).toBe(3)
  expect(connectivity.valid).toBe(true)
  expect(
    validateRoutedCopperDrc({
      ...context,
      clearance: input.minTraceToPadEdgeClearance!,
      allowBlindAndBuriedVias: false,
    }).issues,
  ).toEqual([])
  const [report] = busLengthReports(input, traces)
  expect(report!.aboveMinimumLength).toBe(true)
  expect(report!.matched).toBe(true)

  // A pad loses its escape via only if it had a site before this bus.
  const pending = getPendingPads(input)
  expect(new Set(pending.map((p) => p.net)).size).toBe(33)
  const routed = { ...input, traces }
  const lost = pending.filter(
    (p) => countViaSites(input, p) > 0 && countViaSites(routed, p) === 0,
  )
  expect(lost.map((p) => p.net).sort()).toEqual([
    "source_net_52",
    "source_net_53",
  ])

  const graphics = new BusLanesSolver(routed).visualize()
  graphics.title =
    "ButterStick U11 address/command: net 26's tuning takes the last via sites of two pending RAM pads"
  graphics.circles = [
    ...(graphics.circles ?? []),
    ...lost.map((p) => ({
      center: p.pad.center,
      radius: 0.45,
      stroke: "#dc2626",
      label: `${p.net}: no via site left`,
    })),
  ]
  graphics.texts = [
    ...(graphics.texts ?? []),
    ...lost.map((p, index) => ({
      x: p.pad.center.x - 6,
      y: p.pad.center.y + 2 + index * 0.8,
      text: `${p.net}: no via site left`,
      color: "#dc2626",
      fontSize: 0.5,
      anchorSide: "bottom_left" as const,
    })),
    {
      x: Math.min(...input.obstacles.map((o) => o.center.x - o.width / 2)),
      y: Math.max(...input.obstacles.map((o) => o.center.y + o.height / 2)) + 1,
      text: graphics.title,
      color: "#111827",
      fontSize: 0.8,
      anchorSide: "bottom_left" as const,
    },
  ]
  await expect(
    getSvgFromGraphicsObject(graphics, { backgroundColor: "white" }),
  ).toMatchSvgSnapshot(import.meta.path)
})
