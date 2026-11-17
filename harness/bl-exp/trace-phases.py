# Experiment only: log pipeline phase changes and signal-site choice layers.
from pathlib import Path
p = Path("lib/bus-lanes-pipeline-solver.ts")
t = p.read_text()
import re
count = 0
def repl(m):
    global count
    count += 1
    return f'{m.group(1)}this.phase = "{m.group(2)}"; console.log("EXP phase {m.group(2)} attempt=" + this.attempt)'
t = re.sub(r'(\s)this\.phase = "([a-z_]+)"', repl, t)
p.write_text(t)
q = Path("lib/negotiate-signal-sites.ts")
s = q.read_text()
old = "    variants.set(connection.name, choices)\n"
assert s.count(old) == 1
s = s.replace(old, '    console.log(`EXP sites ${connection.name} choices=${choices.map((c: any) => c.layer + ":" + c.length.toFixed(1)).join(",")}`)\n' + old)
q.write_text(s)
print("applied trace-phases", count)
