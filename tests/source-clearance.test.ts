import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"

type SourceClearanceBoard = {
  id: string
  appliedGlobalClearanceMm: number
  sourceCopperMinimumClearanceMm: number
  sourceCopperBelowApplied: number
  sourceCopperKeepsAppliedClearance: boolean
  sourceSha256: string
  unmeasuredCopperPads: Record<string, number>
  checks: Record<string, { tightest: { clearanceMm: number; net: string; against: string; atMm: number[] }[] }>
}
type Manifest = {
  circuits: { id: string; file: string; source: { sourceSha256: string } }[]
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
}

test("the applied clearance is compared with each board's manufactured DDR copper", (): void => {
  const audit = readJson<{ boards: SourceClearanceBoard[] }>("provenance/source-clearance.json")
  const manifest = readJson<Manifest>("manifest.json")
  expect(audit.boards.map((board) => board.id)).toEqual(manifest.circuits.map((circuit) => circuit.id))

  // The committed audit must describe the committed fixtures and source boards.
  for (const circuit of manifest.circuits) {
    const fixture = JSON.parse(
      gunzipSync(readFileSync(new URL(`../${circuit.file}`, import.meta.url))).toString(),
    ) as { rules: { appliedGlobalClearance: number } }
    const board = audit.boards.find((candidate) => candidate.id === circuit.id)!
    expect(board.appliedGlobalClearanceMm).toBe(fixture.rules.appliedGlobalClearance)
    expect(board.sourceSha256).toBe(circuit.source.sourceSha256)
  }

  // Nine boards are routed under a rule their own manufactured copper keeps.
  // A13 is asked for 0.2 mm although its original DDR routing goes down to 0.1249 mm.
  const stricterThanSource = audit.boards.filter((board) => !board.sourceCopperKeepsAppliedClearance)
  expect(
    stricterThanSource.map((board) => ({
      id: board.id,
      applied: board.appliedGlobalClearanceMm,
      sourceMinimum: board.sourceCopperMinimumClearanceMm,
      sourceCopperBelowApplied: board.sourceCopperBelowApplied,
    })),
  ).toEqual([{ id: "a13", applied: 0.2, sourceMinimum: 0.1249, sourceCopperBelowApplied: 308 }])

  // No copper pad on A13 is left unmeasured, and the tightest gap is against a
  // rounded-rectangle CPU pad, not a RAM ball.
  const a13 = audit.boards.find((board) => board.id === "a13")!
  expect(a13.unmeasuredCopperPads).toEqual({})
  expect(a13.checks.traceToPad.tightest[0]).toEqual({
    clearanceMm: 0.1249,
    net: "/DDR3 Memory/cke",
    against: "U100.46",
    atMm: [147.627, 82.777],
  })

  const snapshot = readFileSync(new URL("../repros/a13-source-clearance/board.snap.svg", import.meta.url), "utf8")
  expect(snapshot).toContain(
    "The original board does not keep the applied 0.200 mm clearance: 308 copper pairs on the 96 requested nets are closer, down to 0.1249 mm.",
  )
})
