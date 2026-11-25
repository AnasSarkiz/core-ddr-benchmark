// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// H3 byte 1 (matching attempt) variants after byte 0, plus an SVG of the input.
import { readFileSync, writeFileSync } from "node:fs"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { BusLanesPipelineSolver } from "./lib"

const load = (p: string): any => { const r = JSON.parse(readFileSync(p, "utf8")); return r.simpleRouteJson ?? r }
const run = (label: string, input: any): any => {
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(input))
  solver.solve()
  console.log(`VAR ${label} solved=${solver.solved} t=${((performance.now() - started) / 1000).toFixed(1)}s code=${solver.failureCode ?? ""} error=${String(solver.error ?? "").slice(0, 120)}`)
  return solver
}
const byte0 = run("byte0", load("p1.json"))
const byte1 = load("p2.json")
byte1.traces = byte0.getOutput().traces
writeFileSync("out/byte1-input.json", JSON.stringify(byte1))
const unconstrained = { ...byte1, buses: byte1.buses.map((b: any) => ({ busId: b.busId, name: b.name, connectionNames: b.connectionNames, allowedLayers: b.allowedLayers })) }
run("byte1-matching", byte1)
run("byte1-no-length-targets", unconstrained)
run("byte1-without-byte0-copper", { ...byte1, traces: [] })
run("byte1-no-targets-without-byte0", { ...unconstrained, traces: [] })
const merged = { ...byte1, buses: [{ ...byte1.buses[0], connectionNames: byte1.buses.flatMap((b: any) => b.connectionNames) }] }
run("byte1-dqs-in-byte-bus", merged)
const probe: any = new BusLanesPipelineSolver(structuredClone(byte1))
writeFileSync("out/byte1-input.svg", getSvgFromGraphicsObject(probe.visualize(), { backgroundColor: "white" }))
