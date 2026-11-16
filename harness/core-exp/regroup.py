"""Experiment only: move each byte lane's strobe pair and mask into its byte group."""
import gzip, json, re, sys
path = sys.argv[1]
f = json.loads(gzip.open(path).read())
rules = [
    (r"SDQM(\d)$", "byte{}"), (r"SDQS(\d)[NP]$", "byte{}"),
    (r"S0SDQM(\d)$", "byte{}"), (r"S0SDQS(\d)_[NP]$", "byte{}"),
    (r"RAM_LDM$", "byte0"), (r"RAM_LDQS_", "byte0"), (r"RAM_UDM$", "byte1"), (r"RAM_UDQS_", "byte1"),
]
moved = []
groups = {t["group"] for t in f["traces"]}
for t in f["traces"]:
    for pattern, target in rules:
        m = re.search(pattern, t["name"]) or re.search(pattern, t["nativeNet"])
        if not m: continue
        group = target.format(*m.groups())
        if group in groups and t["group"] == "remaining":
            t["group"] = group
            moved.append((t["name"], group))
        break
gzip.open(path, "wb").write(json.dumps(f, separators=(",", ":")).encode())
print("moved", moved)
