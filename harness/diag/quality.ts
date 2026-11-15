// Per-trace copper for existing A13 fixtures, plus the pending exits the
// request receives. Run from the solver checkout: bun ../harness-repo/harness/diag/quality.ts <label>
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { BusLanesPipelineSolver } from "../../../solver/lib"
import { pendingPackageExits } from "../../../solver/lib/pending-lane-certificates"

const label = process.argv[2]
const read = (path: string) =>
  JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"))
const length = (trace: any) =>
  trace.route
    .slice(1)
    .reduce(
      (sum: number, p: any, i: number) =>
        sum + Math.hypot(p.x - trace.route[i].x, p.y - trace.route[i].y),
      0,
    )
const cases: [string, any, any][] = []
{
  const f = read("tests/fixtures/a13-preloaded-byte1/input.json.gz")
  cases.push([
    "a13-preloaded-byte1",
    f.input,
    { maxSearchIterations: 20_000, singleCarrier: { fixedConnections: f.fixedConnections } },
  ])
}
cases.push(["a13-ram-byte0", read("tests/fixtures/a13-ram-byte0/input.srj.json.gz"), undefined])
{
  const f = read("tests/fixtures/a13-ram-bytes-sequence/input.json.gz")
  cases.push(["sequence-ram-byte0", f.ramByte0Request, undefined])
}
const out: any = {}
for (const [name, input, options] of cases) {
  const exits: any[] = []
  const gen = pendingPackageExits(input, [])
  let step = gen.next()
  let steps = 0
  while (!step.done) {
    step = gen.next()
    steps++
  }
  exits.push(...step.value)
  const started = performance.now()
  const solver = options
    ? new BusLanesPipelineSolver(input, options)
    : new BusLanesPipelineSolver(input)
  solver.solve()
  const ms = performance.now() - started
  const supplied = input.traces?.length ?? 0
  const traces = solver.solved ? solver.getOutput().traces.slice(supplied) : []
  const lengths = traces.map(length)
  console.log(
    `QUALITY ${label} ${name}: solved=${solver.solved} error=${solver.error} ms=${ms.toFixed(0)} ` +
      `clearance=${input.minTraceToPadEdgeClearance} exits=${exits.length} exitSteps=${steps} ` +
      `traces=${traces.length} total=${lengths.reduce((a: number, b: number) => a + b, 0).toFixed(2)} ` +
      `min=${Math.min(...lengths).toFixed(2)} max=${Math.max(...lengths).toFixed(2)} ` +
      `vias=${traces.reduce((n: number, t: any) => n + t.route.filter((p: any) => p.route_type === "via").length, 0)} ` +
      `lengths=${lengths.map((l: number) => l.toFixed(1)).join(",")}`,
  )
  out[name] = { exits, traces }
}
writeFileSync(`quality-${label}.json`, JSON.stringify(out))
