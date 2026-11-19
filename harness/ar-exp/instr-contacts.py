from pathlib import Path
p=Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/pipeline9JointDrcRepairUtils.ts"); t=p.read_text()
old="    if (!currentContactKeys.has(contactKey)) return false\n"
assert old in t
t=t.replace(old,"""    if (!currentContactKeys.has(contactKey)) {
      const g = globalThis as { __rejects?: number }
      g.__rejects = (g.__rejects ?? 0) + 1
      if (g.__rejects <= 25) console.log(`NEWCONTACT ${candidateErrors.length}<${currentErrors.length}? ${JSON.stringify(contactKey)} current=${JSON.stringify([...currentContactKeys].slice(0, 6))}`)
      return false
    }
""")
p.write_text(t)
