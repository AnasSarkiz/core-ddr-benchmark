"""Draw the A13 board's manufactured DDR copper against the benchmark's applied clearance.

Board coordinates are KiCad mm (+X right, +Y down); SVG pixels share that
orientation, so no axis is flipped.

    python3 repros/a13-source-clearance/render.py
"""
import collections
import gzip
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from source_clearance import TOLERANCE_MM, load_source_board, measure, summarize

CIRCUIT_ID = "a13"
MEMORY_REF = "U200"
OVERVIEW_PX_PER_MM = 17.0
DETAIL_PX_PER_MM = 58.0
RED = "#d62728"
TOP = "#2b6cb0"
BOTTOM = "#2f9e8f"
PAD = "#9aa0a6"
INK = "#1f2933"


def n(value):
    return f"{value:.2f}"


def mm(value):
    """Three decimals, or four when the value needs them (0.1249 must not read as 0.125)."""
    return f"{value:.3f}" if abs(round(value, 3) - value) < 1e-9 else f"{value:.4f}"


def text(x, y, content, size=15, weight="normal", fill=INK, anchor="start"):
    return f'<text x="{n(x)}" y="{n(y)}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{content}</text>'


def draw_pad(pad, to_px, scale, fill=PAD):
    x, y = to_px(pad["x"], pad["y"])
    if pad["shape"] == "circle":
        return f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(pad["width"] / 2 * scale)}" fill="{fill}"/>'
    width, height = pad["width"] * scale, pad["height"] * scale
    return f'<rect x="{n(x - width / 2)}" y="{n(y - height / 2)}" width="{n(width)}" height="{n(height)}" fill="{fill}" transform="rotate({n(-pad["angle"])} {n(x)} {n(y)})"/>'


def draw_segment(segment, to_px, scale, color):
    x1, y1 = to_px(segment["x1"], segment["y1"])
    x2, y2 = to_px(segment["x2"], segment["y2"])
    return f'<line x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}" stroke="{color}" stroke-width="{n(max(segment["width"] * scale, 1.2))}" stroke-linecap="round"/>'


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    circuit = next(c for c in manifest["circuits"] if c["id"] == CIRCUIT_ID)
    fixture = json.loads(gzip.decompress((ROOT / circuit["file"]).read_bytes()))
    board = load_source_board(circuit)
    findings, pair_gaps, unmeasured_pads = measure(fixture, board)
    summary = summarize(fixture, findings, pair_gaps, unmeasured_pads)
    applied = summary["appliedGlobalClearanceMm"]
    nets = {trace["nativeNet"] for trace in fixture["traces"]}
    refs = {part["name"] for part in fixture["parts"]}
    width = min(fixture["rules"]["widths"])

    below = [f for f in findings if f["clearance"] < applied - TOLERANCE_MM]
    red_segments = {index for f in below for index in f["segments"]}
    red_vias = {index for f in below for index in f["vias"]}
    signal_segments = [(i, s) for i, s in enumerate(board["segments"]) if s["net"] in nets]
    signal_vias = [(i, v) for i, v in enumerate(board["vias"]) if v["net"] in nets]
    pads = [pad for pad in board["pads"] if pad["ref"] in refs]
    memory_pads = [pad for pad in pads if pad["ref"] == MEMORY_REF]
    top_layer = board["copper"][0]

    xs = [v for _, s in signal_segments for v in (s["x1"], s["x2"])] + [pad["x"] for pad in pads]
    ys = [v for _, s in signal_segments for v in (s["y1"], s["y2"])] + [pad["y"] for pad in pads]
    region = (min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1)
    overview_w = (region[2] - region[0]) * OVERVIEW_PX_PER_MM
    overview_h = (region[3] - region[1]) * OVERVIEW_PX_PER_MM
    detail = (
        min(pad["x"] for pad in memory_pads) - 0.8, min(pad["y"] for pad in memory_pads) - 0.8,
        max(pad["x"] for pad in memory_pads) + 0.8, max(pad["y"] for pad in memory_pads) + 0.8,
    )
    detail_w = (detail[2] - detail[0]) * DETAIL_PX_PER_MM
    detail_h = (detail[3] - detail[1]) * DETAIL_PX_PER_MM
    margin, header = 28.0, 150.0
    overview_x, panel_y = margin, header + 34
    detail_x = overview_x + overview_w + 40
    channel_x = detail_x + detail_w + 40
    channel_w = 430.0
    total_w = channel_x + channel_w + margin
    total_h = panel_y + max(overview_h, detail_h) + margin + 24

    def overview_px(x, y):
        return overview_x + (x - region[0]) * OVERVIEW_PX_PER_MM, panel_y + (y - region[1]) * OVERVIEW_PX_PER_MM

    def detail_px(x, y):
        return detail_x + (x - detail[0]) * DETAIL_PX_PER_MM, panel_y + (y - detail[1]) * DETAIL_PX_PER_MM

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{n(total_w)}" height="{n(total_h)}" viewBox="0 0 {n(total_w)} {n(total_h)}">',
        f'<rect width="{n(total_w)}" height="{n(total_h)}" fill="white"/>',
        text(margin, 40, f"{fixture['title']}: manufactured DDR copper vs. the benchmark's applied clearance", 24, "bold"),
    ]
    checks = summary["checks"]
    keeps = summary["sourceCopperKeepsAppliedClearance"]
    verdict = (
        f"The original board keeps the applied {mm(applied)} mm clearance: its tightest gap on the {len(nets)} requested nets is {summary['sourceCopperMinimumClearanceMm']:.4f} mm."
        if keeps
        else f"The original board does not keep the applied {mm(applied)} mm clearance: {summary['sourceCopperBelowApplied']} copper pairs on the {len(nets)} requested nets are closer, down to {summary['sourceCopperMinimumClearanceMm']:.4f} mm."
    )
    out.append(text(margin, 72, verdict, 17, "bold", INK if keeps else RED))
    out.append(text(
        margin, 98,
        "Closer than applied: "
        + ", ".join(f"{checks[kind]['belowApplied']} {label}" for kind, label in (
            ("traceToPad", "trace-to-pad"), ("traceToTrace", "trace-to-trace"),
            ("viaToPad", "via-to-pad"), ("viaToTrace", "via-to-trace"),
        ))
        + f". Coupled differential-pair gaps ({summary['differentialPairGaps']['measuredPairs']} pairs) are excluded.",
        15,
    ))
    out.append(text(
        margin, 122,
        f"Source: {circuit['source']['repo']} @ {circuit['source']['commit'][:7]}, {circuit['source']['path']}. Original copper is shown for reference only; the benchmark removes it and routes these nets again.",
        13, fill="#52606d",
    ))
    legend_y = 144
    for offset, (color, label) in enumerate(((RED, "closer than the applied clearance"), (TOP, "top copper, keeps it"), (BOTTOM, "bottom copper, keeps it"), (PAD, "pads"))):
        x = margin + offset * 290
        out.append(f'<rect x="{n(x)}" y="{n(legend_y - 11)}" width="26" height="12" fill="{color}"/>')
        out.append(text(x + 34, legend_y, label, 13))

    # Overview: every requested net's original copper on both signal layers.
    out.append(text(overview_x, panel_y - 10, "Requested DDR nets, original routing (both signal layers)", 15, "bold"))
    out.append(f'<rect x="{n(overview_x)}" y="{n(panel_y)}" width="{n(overview_w)}" height="{n(overview_h)}" fill="#f7f9fb" stroke="#cbd2d9"/>')
    out += [draw_pad(pad, overview_px, OVERVIEW_PX_PER_MM) for pad in pads]
    for layer_color, on_top in ((BOTTOM, False), (TOP, True)):
        out += [draw_segment(s, overview_px, OVERVIEW_PX_PER_MM, layer_color) for i, s in signal_segments if (s["layer"] == top_layer) == on_top and i not in red_segments]
    for i, via in signal_vias:
        x, y = overview_px(via["x"], via["y"])
        out.append(f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(via["diameter"] / 2 * OVERVIEW_PX_PER_MM)}" fill="{RED if i in red_vias else "#7b8794"}"/>')
    out += [draw_segment(s, overview_px, OVERVIEW_PX_PER_MM, RED) for i, s in signal_segments if i in red_segments]
    tightest = min(findings, key=lambda f: (f["clearance"], f["net"], f["against"]))
    tx, ty = overview_px(*tightest["at"])
    label = f"tightest source gap: {tightest['clearance']:.4f} mm, {tightest['net'].split('/')[-1]} past {tightest['against']}"
    out.append(f'<circle cx="{n(tx)}" cy="{n(ty)}" r="11" fill="none" stroke="{INK}" stroke-width="2"/>')
    out.append(f'<rect x="{n(tx + 16)}" y="{n(ty - 13)}" width="{n(len(label) * 7.1 + 10)}" height="20" fill="white" fill-opacity="0.92" stroke="#cbd2d9"/>')
    out.append(text(tx + 21, ty + 2, label, 13, "bold"))
    x1, y1 = overview_px(detail[0], detail[1])
    out.append(f'<rect x="{n(x1)}" y="{n(y1)}" width="{n((detail[2] - detail[0]) * OVERVIEW_PX_PER_MM)}" height="{n((detail[3] - detail[1]) * OVERVIEW_PX_PER_MM)}" fill="none" stroke="{INK}" stroke-width="1.5" stroke-dasharray="6 4"/>')
    out.append(f'<rect x="{n(x1)}" y="{n(y1 - 21)}" width="96" height="18" fill="white" fill-opacity="0.9"/>')
    out.append(text(x1 + 4, y1 - 7, f"{MEMORY_REF} (detail)", 13, "bold"))

    # Detail: where a trace centre line may run between the memory balls.
    out.append(text(detail_x, panel_y - 10, f"{MEMORY_REF} top layer: shaded = no trace centre line allowed at {mm(applied)} mm", 15, "bold"))
    out.append(f'<clipPath id="detail"><rect x="{n(detail_x)}" y="{n(panel_y)}" width="{n(detail_w)}" height="{n(detail_h)}"/></clipPath>')
    out.append(f'<rect x="{n(detail_x)}" y="{n(panel_y)}" width="{n(detail_w)}" height="{n(detail_h)}" fill="white" stroke="#cbd2d9"/>')
    out.append('<g clip-path="url(#detail)">')
    for pad in memory_pads:
        x, y = detail_px(pad["x"], pad["y"])
        out.append(f'<circle cx="{n(x)}" cy="{n(y)}" r="{n((pad["width"] / 2 + applied + width / 2) * DETAIL_PX_PER_MM)}" fill="#f4a261" fill-opacity="0.38"/>')
    out += [draw_pad(pad, detail_px, DETAIL_PX_PER_MM, "#52606d") for pad in memory_pads]
    out += [draw_segment(s, detail_px, DETAIL_PX_PER_MM, RED if i in red_segments else TOP) for i, s in signal_segments if s["layer"] == top_layer]
    for i, via in signal_vias:
        x, y = detail_px(via["x"], via["y"])
        out.append(f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(via["diameter"] / 2 * DETAIL_PX_PER_MM)}" fill="none" stroke="{RED if i in red_vias else "#7b8794"}" stroke-width="3"/>')
    out.append("</g>")

    # Channel arithmetic from the fixture's own ball pitch, ball size and trace width.
    ball = collections.Counter(pad["width"] for pad in memory_pads).most_common(1)[0][0]
    pitch = min(
        math.hypot(a["x"] - b["x"], a["y"] - b["y"])
        for a in memory_pads[:12] for b in memory_pads if a is not b
    )
    gap = pitch - ball
    needed = 2 * applied + width
    fits = needed <= gap + TOLERANCE_MM
    via_pad = fixture["rules"]["viaPad"]
    via_needed = ball + via_pad + 2 * applied
    via_fits = via_needed <= pitch * math.sqrt(2) + TOLERANCE_MM
    out.append(text(channel_x, panel_y - 10, "One escape channel between two balls", 15, "bold"))
    scale = 225.0
    cx, cy = channel_x + channel_w / 2, panel_y + 130
    for side in (-1, 1):
        out.append(f'<circle cx="{n(cx + side * pitch / 2 * scale)}" cy="{n(cy)}" r="{n((ball / 2 + applied + width / 2) * scale)}" fill="#f4a261" fill-opacity="0.38"/>')
    for side in (-1, 1):
        out.append(f'<circle cx="{n(cx + side * pitch / 2 * scale)}" cy="{n(cy)}" r="{n(ball / 2 * scale)}" fill="#52606d"/>')
    out.append(f'<rect x="{n(cx - width / 2 * scale)}" y="{n(cy - 110)}" width="{n(width * scale)}" height="220" fill="{TOP if fits else RED}"/>')
    lines = [
        (f"Ball pitch {pitch:.3f} mm, ball {ball:.3f} mm: {gap:.3f} mm between balls.", INK, "normal"),
        (f"A {width:.4f} mm trace at {mm(applied)} mm clearance needs", INK, "normal"),
        (f"2 x {mm(applied)} + {width:.4f} = {needed:.3f} mm: {'fits' if fits else 'does not fit'}.", INK if fits else RED, "bold"),
        (f"A {via_pad:.2f} mm via between four balls needs {via_needed:.3f} mm", INK, "normal"),
        (f"of the {pitch * math.sqrt(2):.3f} mm diagonal: {'fits' if via_fits else 'does not fit'}.", INK if via_fits else RED, "bold"),
        (f"The original trace keeps {(gap - width) / 2:.4f} mm to each ball.", INK, "normal"),
    ]
    for index, (line, color, weight) in enumerate(lines):
        out.append(text(channel_x, cy + 150 + index * 26, line, 15, weight, color))
    out.append("</svg>")
    (Path(__file__).parent / "board.snap.svg").write_text("\n".join(out) + "\n")
    print(verdict)


if __name__ == "__main__":
    main()
