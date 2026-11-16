import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
import { getBugReportSnapshotSvg } from "lib/testing/getBugReportSnapshotSvg"
import type { SimpleRouteJson } from "lib/types"

test("A13 regional repair leaves routed traces inside the declared clearance", async (): Promise<void> => {
  // The real A13 DDR section after Core routes the four data bytes: 64
  // remaining connections, with the byte copper as 2,603 fixed obstacles.
  const input: SimpleRouteJson = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL(
            "../fixtures/assets/a13-fixed-copper/remaining64.srj.json.gz",
            import.meta.url,
          ),
        ),
      ),
    ).toString("utf8"),
  )
  const solver = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, {
    cacheProvider: null,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  const routedTraces = solver.getOutputSimplifiedPcbTraces()
  expect(routedTraces).toHaveLength(64)

  // This board declares 0.1249 mm between traces and other copper. Check
  // that rule, not the 0.1 mm benchmark default.
  const declaredClearance = input.minTraceToPadEdgeClearance
  expect(declaredClearance).toBe(0.1249)
  const drcInput = {
    inputSrj: input,
    srjWithPointPairs: solver.srjWithPointPairs!,
    routedTraces,
    drcOptions: { traceClearance: declaredClearance },
  }
  // Two routed traces that do not touch but sit closer than the declared
  // clearance. Contacts with pads of the two enclosed DM balls are a separate
  // finding and stay in the snapshot's count.
  const closeTracePairs = evaluateRelaxedDrc(drcInput).errors.filter(
    (error) => error.type === "pcb_trace_error" && /gap: /.test(error.message),
  )
  expect(closeTracePairs).toHaveLength(6)
  await expect(getBugReportSnapshotSvg(drcInput)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
