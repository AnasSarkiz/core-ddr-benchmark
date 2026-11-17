// Diagnostic only; never part of a PR. Routes captured A64 byte 2 requests and
// reports outcome, time, iterations and the next-bus planning stats.
import { readFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

for (const file of process.argv.slice(2)) {
  for (const keepPending of [false, true]) {
    const request = JSON.parse(readFileSync(file, "utf8"))
    if (!keepPending) delete request.pendingRoutingAccess
    const started = performance.now()
    const solver: any = new BusLanesPipelineSolver(request)
    let lastPhase = ""
    while (!solver.solved && !solver.failed && solver.iterations < solver.MAX_ITERATIONS) {
      solver.step()
      if (solver.phase !== lastPhase) {
        console.log(`PHASE ${file.split("/").at(-1)} pending=${keepPending} t=${((performance.now() - started) / 1000).toFixed(1)}s it=${solver.iterations} ${solver.phase}`)
        lastPhase = solver.phase
      }
      if (performance.now() - started > 900_000) break
    }
    console.log(`A64 ${file.split("/").at(-1)} pending=${keepPending} solved=${solver.solved} failed=${solver.failed} error=${String(solver.error).slice(0, 120)} seconds=${((performance.now() - started) / 1000).toFixed(1)} iterations=${solver.iterations}/${solver.MAX_ITERATIONS} stats=${JSON.stringify({ a: solver.stats.nextBusCarrierSignalsLostAlone, l: solver.stats.nextBusCarrierSignalsLost, p: solver.stats.plannedBesideNextBus })}`)
  }
}
