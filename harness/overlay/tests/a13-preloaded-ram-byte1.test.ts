import "./fixtures/pcb-snapshot"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { type AnyCircuitElement, pcb_trace } from "circuit-json"
import {
  BusLanesPipelineSolver,
  type Connection,
  type SimpleRouteJson,
} from "../lib"

// Board coordinates in mm, +X right, +Y up. RAM U200 is on the left, the
// series resistor networks in the middle and CPU U100 on the right.
test("A13 second RAM byte fails beside three completed bytes", async (): Promise<void> => {
  const { input, fixedConnections, circuit } = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/a13-preloaded-ram-byte1/input.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  ) as {
    input: SimpleRouteJson
    fixedConnections: Connection[]
    circuit: AnyCircuitElement[]
  }
  const original = structuredClone(input)
  // Core hands each phase request to the solver without options.
  const solver = new BusLanesPipelineSolver(input)
  solver.solve()
  expect(input).toEqual(original)
  expect(input.connections).toHaveLength(8)
  expect(input.traces).toHaveLength(24)
  expect(fixedConnections).toHaveLength(24)

  // Only the supplied, previously completed copper is drawn. The eight
  // requested connections are shown as straight guide lines, not as routes.
  circuit.push(...input.traces!.map((trace) => pcb_trace.parse(trace)))
  for (const [index, connection] of input.connections.entries()) {
    const [start, end] = connection.pointsToConnect
    circuit.push({
      type: "pcb_note_line",
      pcb_note_line_id: `requested_${index}`,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      stroke_width: 0.07,
      color: "#1d4ed8",
      is_dashed: true,
    } as AnyCircuitElement)
  }
  const caption =
    "FAILED: 0/8 new RAM routes accepted; 24 supplied routes shown; blue dashed lines are the 8 requested connections"
  const svgOptions = {
    backgroundColor: "white",
    shouldDrawErrors: false,
    shouldDrawRatsNest: false,
    showErrorsInTextOverlay: false,
  }
  const status = (x: number, y: number, fontSize: number): AnyCircuitElement => ({
    type: "pcb_note_text",
    pcb_note_text_id: `routing_status_${x}_${y}`,
    pcb_group_id: "routing_status",
    text: caption,
    anchor_position: { x, y },
    font: "tscircuit2024",
    layer: "top",
    font_size: fontSize,
    anchor_alignment: "center",
  })
  await expect([...circuit, status(12, 15.5, 0.55)]).toMatchPcbSnapshot({
    testPath: import.meta.path,
    svgOptions: {
      ...svgOptions,
      width: 1400,
      height: 1000,
      viewport: { minX: -10, maxX: 38, minY: -19, maxY: 18 },
    },
  })
  await expect([...circuit, status(0, 12.6, 0.3)]).toMatchPcbSnapshot({
    testPath: import.meta.path,
    snapshotName: "ram",
    svgOptions: {
      ...svgOptions,
      width: 1300,
      height: 1400,
      viewport: { minX: -9.5, maxX: 9.5, minY: -7.5, maxY: 13 },
    },
  })

  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(true)
  expect(solver.error).toBe(
    "Generated native surface approaches could not satisfy full-path geometry and matching",
  )
}, 900_000)
