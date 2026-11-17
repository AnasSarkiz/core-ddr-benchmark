# Experiment only: log why expanded site choices end empty.
import os
from pathlib import Path
q = Path("lib/expanded-signal-sites.ts")
s = q.read_text()
old = "  if (ends.some((sites) => !sites.length)) return []\n"
assert s.count(old) == 1
s = s.replace(old, '  console.log(`EXP ends ${connection.name} ${targetLayer} sites=${ends.map((e) => e.length).join("/")}`)\n' + old)
old2 = "      if (!search.solved) break\n"
assert s.count(old2) == 1
s = s.replace(old2, '      if (!search.solved) console.log(`EXP pairsearch ${connection.name} solved=${search.solved} failed=${search.failed} steps=${steps} attempt=${attempts}`)\n' + old2)
old3 = "        continue\n      choices.push({\n"
assert s.count(old3) == 1
s = s.replace(old3, '        { console.log(`EXP rejected ${connection.name} visible=${scene.pathVisible(route)} angles=${routeAnglesAreConventional([{ ...carrier, route }])}`); continue }\n      choices.push({\n')
cap = os.environ.get("STEP_CAP")
if cap:
    s = s.replace("while (!search.solved && !search.failed && steps++ < 10000) {", f"while (!search.solved && !search.failed && steps++ < {cap}) {{", 1)
q.write_text(s)
print("applied trace-choices", cap or "")
