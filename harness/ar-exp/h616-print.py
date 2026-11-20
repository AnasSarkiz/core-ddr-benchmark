from pathlib import Path
p = Path("tests/repro/pipeline9-h616-full-board-ddr-clearance.test.ts")
t = p.read_text()
old = "  expect(evaluateRelaxedDrc(snapshotInput).errors.length).toBeLessThan(44)\n"
assert t.count(old) == 1
t = t.replace(old, old + """  {
    const diagErrors = evaluateRelaxedDrc(snapshotInput).errors as Array<Record<string, unknown>>
    const byType: Record<string, number> = {}
    for (const e of diagErrors) byType[String(e.type)] = (byType[String(e.type)] ?? 0) + 1
    const contacts = diagErrors.filter((e) => String(e.message ?? "").includes("accidental contact")).length
    console.log(`H616DIAG total=${diagErrors.length} contacts=${contacts} byType=${JSON.stringify(byType)}`)
  }
""")
p.write_text(t)
