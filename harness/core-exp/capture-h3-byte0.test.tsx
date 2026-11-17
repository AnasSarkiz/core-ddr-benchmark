// Diagnostic only; never part of a PR. Captures Core's native H3 byte 0 request,
// including pendingRoutingAccess, and writes it to /tmp/h3-byte0-request.json.gz.
import { expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync, gzipSync } from "node:zlib"
import { getTestFixture } from "tests/fixtures/get-test-fixture"
import { H3RoutingPhaseIntentBoard, type NativeH3Source } from "tests/fixtures/h3-routing-phase-intent/board"
import type { SimpleRouteJson } from "lib/utils/autorouting/SimpleRouteJson"

test("capture native H3 byte 0 request", async () => {
  const source: NativeH3Source = JSON.parse(
    gunzipSync(readFileSync(new URL("../fixtures/h3-routing-phase-intent/source.json.gz", import.meta.url))).toString("utf8"),
  )
  const { circuit } = getTestFixture()
  const captured: SimpleRouteJson[] = []
  circuit.add(
    <H3RoutingPhaseIntentBoard
      source={source}
      captureFirstPhase={async (simpleRouteJson) => {
        captured.push(structuredClone(simpleRouteJson))
        throw new Error("stop after capture")
      }}
    />,
  )
  await circuit.renderUntilSettled()
  expect(captured).toHaveLength(1)
  writeFileSync("/tmp/h3-byte0-request.json.gz", gzipSync(JSON.stringify(captured[0])))
  console.log(`CAPTURED connections=${captured[0]!.connections.length} obstacles=${captured[0]!.obstacles.length} pending=${captured[0]!.pendingRoutingAccess?.map((a) => a.connections.length).join("+")} buses=${JSON.stringify(captured[0]!.buses)?.slice(0, 200)}`)
}, 120_000)
