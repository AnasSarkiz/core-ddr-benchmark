from pathlib import Path
p = Path("tests/h3-byte0-later-bus-carriers.test.ts")
t = p.read_text()
old = '''  expect(withoutBottomCarrier).toEqual([
    "source_net_29",
    "source_net_30",
    "source_net_31",
    "source_net_32",
    "source_net_40",
    "source_net_41",
  ])'''
assert t.count(old) == 1
t = t.replace(old, "  expect(withoutBottomCarrier).toEqual([])")
p.write_text(t)
print("fix expectation applied")
