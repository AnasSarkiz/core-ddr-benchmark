"""Diagnostic only: log which lane-search mode each BusLanesSolver uses."""
from pathlib import Path
p = Path("lib/bus-lanes-solver.ts"); s = p.read_text()
marker = "  private route() {\n"
assert s.count(marker) == 1
s = s.replace(marker, marker + """    if (!(this as any).__logged) {
      ;(this as any).__logged = true
      console.log("LANES route " + JSON.stringify({ useNegotiation: this.useNegotiation, denseSearch: this.options.denseSearch, buses: this.input.buses?.length ?? 0, connections: this.input.connections.length, names: this.input.connections.map((c) => c.name).join(","), traces: this.input.traces?.length ?? 0, allowedLayers: this.input.allowedLayers, terminalLayers: this.input.connections.map((c) => this.terminalLayers.get(c.name)?.length ?? 0).join("") }))
    }
""")
done = "      this.pendingExits = step.value\n"
assert s.count(done) == 1
s = s.replace(done, done + '      console.log("LANES pendingExits " + this.pendingExits.length)\n')
p.write_text(s)
