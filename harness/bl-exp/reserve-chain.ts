// Diagnostic only; never part of a PR. Run from a bus-lanes-solver checkout.
// Chains a board's bus phases. After each phase, finds pending pads (later-net
// pads, by the pendingPackageExits rule) that had an escape before the phase
// and none after. For those, reserves one dogbone (nearest legal via site and a
// straight stub, chosen on the pre-phase copper) as fixed copper of the pad's
// own net, and routes the phase again. Writes the remaining-phase input with
// the accumulated bus copper (reservations removed).
import { readFileSync, writeFileSync } from "node:fs"
import { BusLanesPipelineSolver } from "./lib"

type Pt = { x: number; y: number }
const [outPath, remainingPath, ...phasePaths] = process.argv.slice(2)
const load = (p: string): any => {
  const raw = JSON.parse(readFileSync(p, "utf8"))
  return raw.simpleRouteJson ?? raw
}

type Pending = { pad: any; port: string; layer: string; aliases: Set<string> }
function pendingPads(input: any): Pending[] {
  const pads = input.obstacles.filter((o: any) => o.componentId)
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    while ((parent.get(a) ?? a) !== a) a = parent.get(a)!
    return a
  }
  for (const p of pads) {
    const [first, ...rest] = p.connectedTo
    if (first) for (const a of rest) parent.set(find(a), find(first))
  }
  const groups = new Map<string, any[]>()
  for (const p of pads) {
    if (!p.connectedTo.length) continue
    const k = find(p.connectedTo[0])
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const assigned = new Set<string>()
  for (const c of input.connections) {
    assigned.add(c.name)
    if (c.source_trace_id) assigned.add(c.source_trace_id)
    for (const q of c.pointsToConnect) {
      if (q.pointId) assigned.add(q.pointId)
      if (q.pcb_port_id) assigned.add(q.pcb_port_id)
    }
  }
  for (const t of input.traces ?? []) {
    if (t.connection_name) assigned.add(t.connection_name)
    if (t.source_trace_id) assigned.add(t.source_trace_id)
  }
  const result: Pending[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const aliases = new Set<string>(group.flatMap((p: any) => p.connectedTo))
    if ([...aliases].some((a) => assigned.has(a))) continue
    const ports = group.map((p: any) => p.circuitJsonMetadata?.pcb_port_id).filter(Boolean)
    if (ports.length < 2) continue
    for (const pad of group) {
      const port = pad.circuitJsonMetadata?.pcb_port_id
      if (port) result.push({ pad, port, layer: pad.layers[0], aliases })
    }
  }
  return result
}

const rectDist = (o: any, x: number, y: number): number => {
  const dx = Math.max(Math.abs(x - o.center.x) - o.width / 2, 0)
  const dy = Math.max(Math.abs(y - o.center.y) - o.height / 2, 0)
  return Math.hypot(dx, dy)
}
const segDist = (a: Pt, b: Pt, x: number, y: number): number => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1e-12
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L))
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}

type Access = { open: boolean; sites: (Pt & { d: number; k: number })[]; parents: Int32Array; n: number; x0: number; y0: number; start: number }
const RES = 0.01, HALF = 1.2
function access(input: any, p: Pending, traces: any[]): Access {
  const w = input.minTraceWidth
  const padc = input.minTraceToPadEdgeClearance ?? 0.1
  const ttc = padc
  const vr = (input.minViaPadDiameter ?? input.minViaDiameter ?? 0.45) / 2
  const vpc = input.minViaEdgeToPadEdgeClearance ?? padc
  const cx = p.pad.center.x, cy = p.pad.center.y
  const n = Math.round((2 * HALF) / RES), x0 = cx - HALF, y0 = cy - HALF
  const wireFree = new Uint8Array(n * n).fill(1), viaFree = new Uint8Array(n * n).fill(1)
  const near = (minX: number, maxX: number, minY: number, maxY: number): boolean =>
    maxX > x0 - 1 && minX < x0 + 2 * HALF + 1 && maxY > y0 - 1 && minY < y0 + 2 * HALF + 1
  const apply = (dist: (x: number, y: number) => number, wireR: number | null, viaR: number): void => {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i
      if (!wireFree[k] && !viaFree[k]) continue
      const d = dist(x0 + i * RES, y0 + j * RES)
      if (wireR !== null && d < wireR) wireFree[k] = 0
      if (d < viaR) viaFree[k] = 0
    }
  }
  for (const o of input.obstacles) {
    if (!near(o.center.x - o.width / 2, o.center.x + o.width / 2, o.center.y - o.height / 2, o.center.y + o.height / 2)) continue
    const own = o === p.pad
    apply((x, y) => rectDist(o, x, y), !own && o.layers.includes(p.layer) ? w / 2 + padc : null, vr + vpc)
  }
  for (const t of traces) {
    if (p.aliases.has(t.connection_name) || p.aliases.has(t.source_trace_id)) continue
    const r = t.route
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[i + 1]
      if (a.route_type === "via") {
        if (!near(a.x, a.x, a.y, a.y)) continue
        const dia = a.via_diameter ?? 2 * vr
        apply((x, y) => Math.hypot(x - a.x, y - a.y), w / 2 + dia / 2 + ttc, vr + dia / 2 + ttc)
      } else if (b && b.route_type === "wire" && a.layer === b.layer) {
        if (!near(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y))) continue
        const tw = a.width ?? w
        apply((x, y) => segDist(a, b, x, y), a.layer === p.layer ? w / 2 + tw / 2 + ttc : null, vr + tw / 2 + ttc)
      }
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (rectDist(p.pad, x0 + i * RES, y0 + j * RES) <= 0) wireFree[j * n + i] = 1
  const seen = new Uint8Array(n * n)
  const parents = new Int32Array(n * n).fill(-1)
  const steps = new Int32Array(n * n)
  const start = Math.floor(n / 2) * n + Math.floor(n / 2)
  const queue = [start]
  seen[start] = 1
  let open = false
  const sites: (Pt & { d: number; k: number })[] = []
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head]!
    const i = k % n, j = Math.floor(k / n)
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) open = true
    if (viaFree[k]) sites.push({ x: x0 + i * RES, y: y0 + j * RES, d: steps[k]!, k })
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj
      if (a < 0 || b < 0 || a >= n || b >= n) continue
      const q = b * n + a
      if (wireFree[q] && !seen[q]) { seen[q] = 1; parents[q] = k; steps[q] = steps[k]! + 1; queue.push(q) }
    }
  }
  return { open: open || sites.length > 0, sites, parents, n, x0, y0, start }
}

function reservation(input: any, p: Pending, acc: Access, id: string): any | undefined {
  const site = [...acc.sites].sort((a, b) => a.d - b.d)[0]
  if (!site) return undefined
  // Walk the shortest flood path back to the pad and keep its corners.
  const cells: Pt[] = []
  for (let k = site.k; k !== -1; k = acc.parents[k]!) cells.push({ x: acc.x0 + (k % acc.n) * RES, y: acc.y0 + Math.floor(k / acc.n) * RES })
  cells.reverse()
  const corners = cells.filter((c, i) => {
    if (i === 0 || i === cells.length - 1) return true
    const a = cells[i - 1]!, b = cells[i + 1]!
    return Math.abs((c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x)) > 1e-9
  })
  const other = p.layer === "top" ? "bottom" : "top"
  const width = input.minTraceWidth
  return {
    type: "pcb_trace",
    pcb_trace_id: id,
    connection_name: [...p.aliases].find((a) => a.startsWith("source_trace")) ?? [...p.aliases][0],
    source_trace_id: [...p.aliases].find((a) => a.startsWith("source_trace")),
    route: [
      { route_type: "wire", x: p.pad.center.x, y: p.pad.center.y, width, layer: p.layer },
      ...corners.map((c) => ({ route_type: "wire", x: c.x, y: c.y, width, layer: p.layer })),
      { route_type: "via", x: site.x, y: site.y, from_layer: p.layer, to_layer: other },
    ],
  }
}

function route(input: any): { ok: boolean; traces: any[]; error: string; seconds: number } {
  const started = performance.now()
  const solver: any = new BusLanesPipelineSolver(structuredClone(input))
  solver.solve()
  const seconds = (performance.now() - started) / 1000
  if (!solver.solved || solver.failed) return { ok: false, traces: input.traces ?? [], error: String(solver.error).slice(0, 200), seconds }
  return { ok: true, traces: solver.getOutput().traces, error: "", seconds }
}

let acc: any[] = load(phasePaths[0]!).traces ?? []
const reserved: any[] = []
for (const [index, path] of phasePaths.entries()) {
  const input = load(path)
  input.traces = [...acc, ...reserved]
  const pending = pendingPads(input)
  const before = new Map(pending.map((p) => [p.port, access(input, p, input.traces)]))
  const first = route(input)
  const sealed = first.ok ? pending.filter((p) => before.get(p.port)!.open && !access(input, p, first.traces).open) : []
  console.log(`CHAIN phase=${index + 1} pending=${pending.length} firstOk=${first.ok} t=${first.seconds.toFixed(1)}s newlySealed=${sealed.length} ${first.error}`)
  let result = first
  if (sealed.length) {
    const added = sealed.flatMap((p) => {
      const r = reservation(input, p, before.get(p.port)!, `reserved_escape_${p.port}`)
      if (!r) console.log(`CHAIN phase=${index + 1} noReservationFor=${p.port}`)
      return r ? [r] : []
    })
    reserved.push(...added)
    const retry = { ...input, traces: [...acc, ...reserved] }
    result = route(retry)
    const stillSealed = result.ok ? pending.filter((p) => before.get(p.port)!.open && !access(retry, p, result.traces).open) : []
    console.log(`CHAIN phase=${index + 1} retryOk=${result.ok} t=${result.seconds.toFixed(1)}s reserved=${added.length} stillSealed=${stillSealed.length} ${result.error}`)
    if (!result.ok) result = first
  }
  if (!result.ok) { console.log(`CHAIN stop phase=${index + 1}`); break }
  acc = result.traces.filter((t: any) => !String(t.pcb_trace_id).startsWith("reserved_escape_"))
}
const remaining = load(remainingPath!)
remaining.traces = acc.map((t: any) => ({ ...t, isFixed: true }))
writeFileSync(outPath!, JSON.stringify(remaining))
const finalPending = remaining.connections.flatMap((c: any) => c.pointsToConnect.map((q: any) => q.pcb_port_id))
console.log(`CHAIN done traces=${acc.length} reservedTotal=${reserved.length} remainingEndpoints=${finalPending.length}`)
