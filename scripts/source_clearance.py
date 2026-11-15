"""Compare each fixture's applied clearance with its manufactured source copper.

Every benchmark circuit removes the original routing and asks Core to route the
same nets under `rules.appliedGlobalClearance`. This audit measures the
edge-to-edge clearance the original board's own copper keeps for those nets, so
a rule stricter than the manufactured reference is visible before it is
benchmarked. It measures tracks, vias and circle, oval, rectangle and
rounded-rectangle pads; copper pads of any other shape are reported as
unmeasured rather than assumed clear.

All geometry is in KiCad board coordinates: mm, +X right, +Y down.

    python3 scripts/source_clearance.py            # writes provenance/source-clearance.json
    python3 scripts/source_clearance.py --check    # fails if the committed audit is stale
    python3 scripts/source_clearance.py --apply    # rewrites fixtures stricter than their source
"""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
from urllib.parse import quote
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).parent))
from kicad_source import many, one, parse

ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / "provenance" / "source-clearance.json"

# Source copper is drawn on the designer's grid, so manufactured gaps land
# within a couple of micrometres of the declared rule rather than exactly on it.
TOLERANCE_MM = 0.002
# Only neighbours closer than this can be a clearance finding.
SEARCH_RADIUS_MM = 1.0
GRID_MM = 2.0


def load_source_board(circuit):
    """Return the verified original KiCad board for a manifest circuit."""
    source = circuit["source"]
    target = ROOT / ".source-cache" / circuit["id"] / "board.kicad_pcb"
    if not target.exists():
        url = f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/{quote(source['path'])}"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(urlopen(url, timeout=90).read())
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sourceSha256"]:
        raise ValueError(f"{circuit['id']}: source board hash mismatch")
    return read_board(parse(raw.decode()))


def read_board(tree):
    net_names = {n[1]: n[2] for n in many(tree, "net") if len(n) >= 3}

    def net_name(node):
        value = one(node, "net")
        if not value:
            return None
        # KiCad 10 stores the name itself; earlier formats store a table index.
        name = value[1] if len(value) >= 2 else net_names.get(value[0], value[0])
        return name or None

    pads = []
    for footprint in many(tree, "footprint") + many(tree, "module"):
        properties = {p[1]: p[2] for p in many(footprint, "property")}
        properties.update({p[1].capitalize(): p[2] for p in many(footprint, "fp_text") if p[1] in ("reference", "value")})
        at = one(footprint, "at")
        angle = math.radians(float(at[2])) if len(at) > 2 else 0.0
        for pad in many(footprint, "pad"):
            pad_at = one(pad, "at")
            x, y = float(pad_at[0]), float(pad_at[1])
            size = one(pad, "size")
            pads.append({
                "ref": properties.get("Reference"),
                "pin": pad[1],
                "shape": pad[3],
                "net": net_name(pad),
                "x": float(at[0]) + x * math.cos(angle) + y * math.sin(angle),
                "y": float(at[1]) - x * math.sin(angle) + y * math.cos(angle),
                "width": float(size[0]),
                "height": float(size[1]),
                "angle": float(pad_at[2]) if len(pad_at) > 2 else 0.0,
                "cornerRatio": float(one(pad, "roundrect_rratio", ["0"])[0]),
                "layers": one(pad, "layers", []),
            })
    segments = []
    for segment in many(tree, "segment"):
        start, end = one(segment, "start"), one(segment, "end")
        segments.append({
            "x1": float(start[0]), "y1": float(start[1]), "x2": float(end[0]), "y2": float(end[1]),
            "width": float(one(segment, "width")[0]), "layer": one(segment, "layer")[0], "net": net_name(segment),
        })
    copper = [layer[1] for layer in one(tree, "layers") if len(layer) > 2 and layer[2] in ("signal", "power", "mixed", "jumper")]
    vias = []
    for via in many(tree, "via"):
        at = one(via, "at")
        span = one(via, "layers", [])
        through = "blind" not in via and "micro" not in via
        vias.append({
            "x": float(at[0]), "y": float(at[1]), "diameter": float(one(via, "size")[0]), "net": net_name(via),
            "layers": copper if through or len(span) < 2 else copper[copper.index(span[0]):copper.index(span[1]) + 1],
        })
    return {"pads": pads, "segments": segments, "vias": vias, "copper": copper}


def point_to_segment(x, y, segment):
    dx, dy = segment["x2"] - segment["x1"], segment["y2"] - segment["y1"]
    length = dx * dx + dy * dy
    t = 0.0 if length == 0 else max(0.0, min(1.0, ((x - segment["x1"]) * dx + (y - segment["y1"]) * dy) / length))
    return math.hypot(x - (segment["x1"] + t * dx), y - (segment["y1"] + t * dy))


def segment_to_segment(a, b):
    def side(p, q, r):
        return (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0])

    a1, a2, b1, b2 = (a["x1"], a["y1"]), (a["x2"], a["y2"]), (b["x1"], b["y1"]), (b["x2"], b["y2"])
    if side(a1, b1, b2) * side(a2, b1, b2) < 0 and side(a1, a2, b1) * side(a1, a2, b2) < 0:
        return 0.0
    return min(
        point_to_segment(a["x1"], a["y1"], b), point_to_segment(a["x2"], a["y2"], b),
        point_to_segment(b["x1"], b["y1"], a), point_to_segment(b["x2"], b["y2"], a),
    )


MEASURED_PAD_SHAPES = ("circle", "oval", "rect", "roundrect")


def pad_outline(pad):
    """A measured pad as a core rectangle (half extents, pad-local mm) grown by a radius.

    circle: a point grown by the radius. oval: a line grown by half the short
    side. roundrect: the rectangle inset by its corner radius. rect: radius 0.
    """
    half_w, half_h = pad["width"] / 2, pad["height"] / 2
    if pad["shape"] in ("circle", "oval"):
        radius = min(half_w, half_h)
    elif pad["shape"] == "roundrect":
        radius = pad["cornerRatio"] * min(pad["width"], pad["height"])
    else:
        radius = 0.0
    return half_w - radius, half_h - radius, radius


def to_pad_frame(pad, x, y):
    """Board point -> pad-local point. KiCad pad angles are absolute, counter-clockwise on screen."""
    angle = math.radians(pad["angle"])
    dx, dy = x - pad["x"], y - pad["y"]
    return dx * math.cos(angle) - dy * math.sin(angle), dx * math.sin(angle) + dy * math.cos(angle)


def pad_to_segment(pad, segment):
    """Distance from the pad's copper edge to the segment centre line; 0 when they touch."""
    half_w, half_h, radius = pad_outline(pad)
    x1, y1 = to_pad_frame(pad, segment["x1"], segment["y1"])
    x2, y2 = to_pad_frame(pad, segment["x2"], segment["y2"])
    local = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
    if any(abs(x) <= half_w and abs(y) <= half_h for x, y in ((x1, y1), (x2, y2))):
        return 0.0
    corners = [(-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h)]
    core = min(
        segment_to_segment(local, {"x1": a[0], "y1": a[1], "x2": b[0], "y2": b[1]})
        for a, b in zip(corners, corners[1:] + corners[:1])
    )
    return max(0.0, core - radius)


def pad_to_point(pad, x, y):
    """Distance from the pad's copper edge to a board point; 0 when the point is on the pad."""
    half_w, half_h, radius = pad_outline(pad)
    u, v = to_pad_frame(pad, x, y)
    return max(0.0, math.hypot(max(abs(u) - half_w, 0.0), max(abs(v) - half_h, 0.0)) - radius)


def pad_is_on_layer(pad, layer):
    return any(name in (layer, "*.Cu") or (name == "F&B.Cu" and layer in ("F.Cu", "B.Cu")) for name in pad["layers"])


def are_differential_partners(first, second):
    """Names that differ only by one polarity character (P/N or +/-)."""
    if first is None or second is None or len(first) != len(second):
        return False
    differing = [(a, b) for a, b in zip(first, second) if a != b]
    return len(differing) == 1 and {differing[0][0].upper(), differing[0][1].upper()} in ({"P", "N"}, {"+", "-"})


def measure(fixture, board):
    """Clearance findings between the fixture nets' source copper and foreign copper.

    Tracks, vias and circle, oval, rectangle and rounded-rectangle pads are
    measured exactly. Pads of any other shape are not measured and are counted
    in `unmeasuredCopperPads`. Coupled differential-pair gaps are counted separately
    because they follow the pair gap rule instead of the clearance rule.
    """
    nets = {trace["nativeNet"] for trace in fixture["traces"]}
    segments = board["segments"]
    if not any(segment["net"] in nets for segment in segments):
        raise ValueError(f"{fixture['id']}: the source board has no copper on the fixture nets")
    measured_pads = [pad for pad in board["pads"] if pad["shape"] in MEASURED_PAD_SHAPES]
    # A pad is filed under every grid cell its bounding circle touches.
    pad_grid = collections.defaultdict(list)
    for pad in measured_pads:
        reach = math.hypot(pad["width"], pad["height"]) / 2
        for gx in range(int((pad["x"] - reach) // GRID_MM), int((pad["x"] + reach) // GRID_MM) + 1):
            for gy in range(int((pad["y"] - reach) // GRID_MM), int((pad["y"] + reach) // GRID_MM) + 1):
                pad_grid[(gx, gy)].append(pad)
    segment_grid = collections.defaultdict(list)
    for index, segment in enumerate(segments):
        for gx in range(int(min(segment["x1"], segment["x2"]) // GRID_MM), int(max(segment["x1"], segment["x2"]) // GRID_MM) + 1):
            for gy in range(int(min(segment["y1"], segment["y2"]) // GRID_MM), int(max(segment["y1"], segment["y2"]) // GRID_MM) + 1):
                segment_grid[(gx, gy)].append(index)

    findings = []
    pair_gaps = []
    measured_segment_pairs = set()
    for index, segment in enumerate(segments):
        if segment["net"] not in nets:
            continue
        cells = {
            (gx, gy)
            for gx in range(int(min(segment["x1"], segment["x2"]) // GRID_MM) - 1, int(max(segment["x1"], segment["x2"]) // GRID_MM) + 2)
            for gy in range(int(min(segment["y1"], segment["y2"]) // GRID_MM) - 1, int(max(segment["y1"], segment["y2"]) // GRID_MM) + 2)
        }
        measured_here = set()
        for cell in sorted(cells):
            for pad in pad_grid.get(cell, []):
                if id(pad) in measured_here or pad["net"] == segment["net"] or not pad_is_on_layer(pad, segment["layer"]):
                    continue
                measured_here.add(id(pad))
                clearance = pad_to_segment(pad, segment) - segment["width"] / 2
                if clearance < SEARCH_RADIUS_MM:
                    findings.append({"kind": "traceToPad", "clearance": clearance, "net": segment["net"], "against": f"{pad['ref']}.{pad['pin']}", "at": (pad["x"], pad["y"]), "segments": [index], "vias": []})
            for other_index in segment_grid.get(cell, []):
                other = segments[other_index]
                if other["net"] == segment["net"] or other["layer"] != segment["layer"]:
                    continue
                pair = (min(index, other_index), max(index, other_index))
                if pair in measured_segment_pairs:
                    continue
                measured_segment_pairs.add(pair)
                clearance = segment_to_segment(segment, other) - segment["width"] / 2 - other["width"] / 2
                if clearance >= SEARCH_RADIUS_MM:
                    continue
                if are_differential_partners(segment["net"], other["net"]):
                    pair_gaps.append(clearance)
                    continue
                findings.append({"kind": "traceToTrace", "clearance": clearance, "net": segment["net"], "against": other["net"] or "(no net)", "at": ((segment["x1"] + segment["x2"]) / 2, (segment["y1"] + segment["y2"]) / 2), "segments": [i for i in pair if segments[i]["net"] in nets], "vias": []})
    for via_index, via in enumerate(board["vias"]):
        if via["net"] not in nets:
            continue
        home = (int(via["x"] // GRID_MM), int(via["y"] // GRID_MM))
        measured_here = set()
        for cell in sorted((home[0] + gx, home[1] + gy) for gx in (-1, 0, 1) for gy in (-1, 0, 1)):
            for pad in pad_grid.get(cell, []):
                if id(pad) in measured_here or pad["net"] == via["net"] or not any(pad_is_on_layer(pad, layer) for layer in via["layers"]):
                    continue
                measured_here.add(id(pad))
                clearance = pad_to_point(pad, via["x"], via["y"]) - via["diameter"] / 2
                if clearance < SEARCH_RADIUS_MM:
                    findings.append({"kind": "viaToPad", "clearance": clearance, "net": via["net"], "against": f"{pad['ref']}.{pad['pin']}", "at": (via["x"], via["y"]), "segments": [], "vias": [via_index]})
            for other_index in segment_grid.get(cell, []):
                other = segments[other_index]
                if other["net"] == via["net"] or other["layer"] not in via["layers"]:
                    continue
                clearance = point_to_segment(via["x"], via["y"], other) - via["diameter"] / 2 - other["width"] / 2
                if clearance < SEARCH_RADIUS_MM:
                    findings.append({"kind": "viaToTrace", "clearance": clearance, "net": via["net"], "against": other["net"] or "(no net)", "at": (via["x"], via["y"]), "segments": [other_index] if other["net"] in nets else [], "vias": [via_index]})
    # Only copper pads can be a clearance finding; paste-only apertures are not counted.
    unmeasured = collections.Counter(
        pad["shape"] for pad in board["pads"]
        if pad["shape"] not in MEASURED_PAD_SHAPES and any(pad_is_on_layer(pad, layer) for layer in board["copper"])
    )
    return findings, pair_gaps, dict(sorted(unmeasured.items()))


def summarize(fixture, findings, pair_gaps, unmeasured_pads):
    applied = fixture["rules"]["appliedGlobalClearance"]
    checks = {}
    for kind in ("traceToPad", "traceToTrace", "viaToPad", "viaToTrace"):
        rows = sorted((f for f in findings if f["kind"] == kind), key=lambda f: (f["clearance"], f["net"], f["against"]))
        checks[kind] = {
            "measuredPairs": len(rows),
            "minimumMm": round(rows[0]["clearance"], 4) if rows else None,
            "belowApplied": sum(1 for f in rows if f["clearance"] < applied - TOLERANCE_MM),
            "tightest": [{"clearanceMm": round(f["clearance"], 4), "net": f["net"], "against": f["against"], "atMm": [round(f["at"][0], 3), round(f["at"][1], 3)]} for f in rows[:3]],
        }
    minimum = min(check["minimumMm"] for check in checks.values() if check["minimumMm"] is not None)
    return {
        "id": fixture["id"],
        "appliedGlobalClearanceMm": applied,
        "sourceCopperMinimumClearanceMm": minimum,
        "sourceCopperBelowApplied": sum(check["belowApplied"] for check in checks.values()),
        "sourceCopperKeepsAppliedClearance": minimum >= applied - TOLERANCE_MM,
        "differentialPairGaps": {"measuredPairs": len(pair_gaps), "minimumMm": round(min(pair_gaps), 4) if pair_gaps else None},
        "unmeasuredCopperPads": unmeasured_pads,
        "checks": checks,
    }


def source_kept_clearance(fixture, findings, summary):
    """The applied clearance, capped at the tightest clearance the source copper keeps."""
    applied = fixture["rules"]["appliedGlobalClearance"]
    if summary["sourceCopperKeepsAppliedClearance"]:
        return applied
    # Rounded down to 0.1 um so the source copper itself always satisfies the result.
    return math.floor(min(finding["clearance"] for finding in findings) * 10000) / 10000


def audit_all(apply=False):
    manifest = json.loads((ROOT / "manifest.json").read_text())
    boards = []
    for circuit in manifest["circuits"]:
        fixture = json.loads(gzip.decompress((ROOT / circuit["file"]).read_bytes()))
        findings, pair_gaps, unmeasured_pads = measure(fixture, load_source_board(circuit))
        summary = summarize(fixture, findings, pair_gaps, unmeasured_pads)
        clearance = source_kept_clearance(fixture, findings, summary)
        if apply and clearance != fixture["rules"]["appliedGlobalClearance"]:
            # Imported fixtures repeat the rule in their source record and in the manifest.
            source_records = [record for record in (fixture.get("source"), circuit["source"]) if record and "rules" in record]
            for rules in [fixture["rules"]] + [record["rules"] for record in source_records]:
                rules["appliedGlobalClearance"] = clearance
            raw = gzip.compress((json.dumps(fixture, separators=(",", ":")) + "\n").encode(), mtime=0)
            (ROOT / circuit["file"]).write_bytes(raw)
            circuit["sha256"] = hashlib.sha256(raw).hexdigest()
            summary = summarize(fixture, findings, pair_gaps, unmeasured_pads)
        boards.append({**summary, "sourceSha256": circuit["source"]["sourceSha256"]})
    if apply:
        (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return {"schemaVersion": 1, "toleranceMm": TOLERANCE_MM, "boards": boards}


if __name__ == "__main__":
    serialized = json.dumps(audit_all(apply="--apply" in sys.argv), indent=2) + "\n"
    if "--check" in sys.argv:
        if AUDIT_PATH.read_text() != serialized:
            raise SystemExit("provenance/source-clearance.json is stale; run python3 scripts/source_clearance.py")
    else:
        AUDIT_PATH.write_text(serialized)
    for board in json.loads(serialized)["boards"]:
        print(f"{board['id']:12s} applied {board['appliedGlobalClearanceMm']:<8} source minimum {board['sourceCopperMinimumClearanceMm']:<7} below applied {board['sourceCopperBelowApplied']}")
