// Diagnostic only; never part of a PR. Run from the tscircuit-autorouter checkout.
// Counts capacity nodes split into per-layer nodes for several inputs.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/index"
import { loadMotherboardPowerPhase } from "./fixtures/bug-reports/bugreport110-motherboard-power-phase/repro"

const inputs: [string, any][] = [
  ["a13", JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString("utf8"))],
  ["h616-full", JSON.parse(gunzipSync(readFileSync("tests/fixtures/assets/h616-full-board-ddr-clearance.json.gz")).toString("utf8")).inputSrj],
  ["motherboard", loadMotherboardPowerPhase()],
]
for (const [label, srj] of inputs) {
  const solver: any = new AutoroutingPipelineSolver9_PreloadedTraceGraph(srj, { cacheProvider: null })
  while (!solver.solved && !solver.failed && solver.getCurrentPhase() !== "nodeDimensionSubdivisionSolver") solver.step()
  const merged = solver.topologyMergingSolver.getOutput()
  const nodes = solver.capacityNodes
  const split = new Set(nodes.filter((n: any) => /_z\d+$/.test(n.capacityMeshNodeId)).map((n: any) => n.capacityMeshNodeId.replace(/_z\d+$/, "")))
  const multi = merged.filter((n: any) => n.availableZ.length > 1 && !n._isComponentTopologyNode && !n._containsTarget && !n._containsObstacle).length
  console.log(`SPLIT ${label} merged=${merged.length} eligibleMultiLayer=${multi} split=${split.size}`)
}
