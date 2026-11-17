import { expect, test } from "bun:test"
import type { PendingRoutingAccess, SimpleRouteJson } from "../lib"
import { getNextBusPlan } from "../lib/plan-with-pending-buses"

function signal(name: string, x: number): SimpleRouteJson["connections"][0] {
  return {
    name,
    pointsToConnect: [
      { x, y: 0, layer: "top" },
      { x, y: 10, layer: "top" },
    ],
  }
}

test("plans the current bus with the next later bus that shares its rules", (): void => {
  const remaining: PendingRoutingAccess = {
    connections: [signal("clock", 3)],
    minTraceWidth: 0.1,
  }
  const byte1: PendingRoutingAccess = {
    connections: [signal("dq8", 2)],
    buses: [{ busId: "byte1", connectionNames: ["dq8"] }],
    minTraceWidth: 0.1,
    minTraceToPadEdgeClearance: 0.09,
  }
  const input: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    minTraceToPadEdgeClearance: 0.09,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 15 },
    obstacles: [],
    connections: [signal("dq0", 1)],
    buses: [{ busId: "byte0", connectionNames: ["dq0"] }],
    pendingRoutingAccess: [remaining, byte1],
  }

  const plan = getNextBusPlan(input)!
  expect(plan.laterBus).toBe(byte1)
  expect(plan.alone).not.toHaveProperty("pendingRoutingAccess")
  expect(plan.alone.connections.map((c) => c.name)).toEqual(["dq0"])
  expect(plan.joint).not.toHaveProperty("pendingRoutingAccess")
  expect(plan.joint.connections.map((c) => c.name)).toEqual(["dq0", "dq8"])
  expect(plan.joint.buses!.map((bus) => bus.busId)).toEqual(["byte0", "byte1"])

  // One request carries one rule set: a later bus with another clearance is
  // not planned with this one.
  expect(
    getNextBusPlan({
      ...input,
      pendingRoutingAccess: [{ ...byte1, minTraceToPadEdgeClearance: 0.1 }],
    }),
  ).toBeUndefined()
  expect(
    getNextBusPlan({ ...input, pendingRoutingAccess: [remaining] }),
  ).toBeUndefined()
})
