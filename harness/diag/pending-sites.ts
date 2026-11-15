// Diagnostic only; never part of a PR. Run from the bus-lanes-solver checkout.
// For every connection a later request still has to route, count the legal
// via sites the solver itself finds at each pad, given the copper so far.
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { resolve } from "node:path"

const lib = (name: string) => import(resolve(process.cwd(), "lib", name))
const { expandedSignalSites } = await lib("expanded-signal-sites.ts")
const drain = <T,>(generator: Generator<void, T>): T => {
  let state = generator.next()
  while (!state.done) state = generator.next()
  return state.value
}
const { input, pendingConnections } = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString("utf8"))
console.log(`== ${process.argv[2]} traces=${input.traces?.length ?? 0} pending=${pendingConnections.length}`)
const started = performance.now()
for (const connection of pendingConnections) {
  const single = { ...input, connections: [connection] }
  const counts: string[] = []
  for (const allowPadEdgeSites of [false, true]) {
    const ends = drain(expandedSignalSites({ input: single, connection, targetLayer: "bottom", allowPadEdgeSites }))
    counts.push(`${ends[0].length}/${ends[1].length}`)
  }
  const ports = connection.pointsToConnect.map((p: any) => p.pcb_port_id).join(",")
  console.log(`SITES ${connection.name} [${ports}] interstitial=${counts[0]} padEdge=${counts[1]}`)
}
console.log(`TIME ${((performance.now() - started) / 1000).toFixed(1)}s`)
