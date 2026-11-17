# Experiment only: log why the expanded pair search fails at setup.
from pathlib import Path
g = Path("lib/grid-visibility.ts")
s = g.read_text()
old1 = '''    if (!a || !z) {
      this.failed = true'''
assert s.count(old1) == 1
s = s.replace(old1, '''    if ((globalThis as any).__expTrace) console.log(`EXP setup starts=${this.startAttachments.length} ends=${this.endAttachments.length} a=${!!a} z=${!!z}`)
    if (!a || !z) {
      this.failed = true''')
old2 = '''      if (!sameComponent(this.startAttachments, this.endAttachments)) {
        this.failed = true'''
assert s.count(old2) == 1
s = s.replace(old2, '''      if ((globalThis as any).__expTrace) {
        const comps = (list: Attachment[]) => [...new Set(list.map((x) => components.at(x.id)))].join(",")
        console.log(`EXP reach startComponents=${comps(this.startAttachments)} endComponents=${comps(this.endAttachments)}`)
      }
      if (!sameComponent(this.startAttachments, this.endAttachments)) {
        this.failed = true''')
g.write_text(s)
q = Path("lib/expanded-signal-sites.ts")
t = q.read_text()
old3 = "    const search = new GridVisibilitySearch(\n      scene,\n      starts[0],\n      goals[0],\n"
assert t.count(old3) == 1, t.count(old3)
t = t.replace(old3, '    ;(globalThis as any).__expTrace = true\n    console.log(`EXP pair ${connection.name} ${targetLayer} starts=${starts.length} goals=${goals.length} s0=(${starts[0].x.toFixed(2)},${starts[0].y.toFixed(2)},${(starts[0] as any).layer}) g0=(${goals[0].x.toFixed(2)},${goals[0].y.toFixed(2)},${(goals[0] as any).layer})`)\n' + old3)
old4 = "    try {\n      let steps = 0\n      while (!search.solved && !search.failed && steps++ < 10000) {"
assert t.count(old4) == 1
t = t.replace(old4, "    ;(globalThis as any).__expTrace = false\n" + old4)
q.write_text(t)
print("applied trace-reach")
