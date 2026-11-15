# A13 is benchmarked under a clearance its own board does not keep

Every circuit removes the original routing and asks Core to route the same DDR
nets under `rules.appliedGlobalClearance`. For A13 that value is 0.2 mm, the
largest clearance declared by the source net classes.

The manufactured board,
[vd-rd/sbc_allwinner_a13 @ 8973c32](https://github.com/vd-rd/sbc_allwinner_a13/blob/8973c32c64349515da64e268cc03ea8c0789ca2a/hardware/module.kicad_pcb),
does not keep 0.2 mm on these nets. Its DDR copper has 308 pairs closer than
that: 64 trace-to-pad, 59 trace-to-trace, 67 via-to-pad and 118 via-to-trace.
The tightest is 0.1249 mm, where the `cke` trace leaves the CPU past pad
`U100.46` (circled in the overview); every other pair keeps at least 0.1271 mm.
Coupled differential-pair gaps are excluded; they follow the pair gap rule.

At 0.2 mm the RAM cannot be escaped at all. `U200` has 0.4 mm balls on a 0.8 mm
pitch, leaving 0.400 mm between balls. One 0.1016 mm trace needs
2 x 0.200 + 0.1016 = 0.502 mm, and a 0.45 mm via between four balls needs
1.250 mm of the 1.131 mm diagonal. Via-in-pad is disabled. The original traces
pass between the balls with 0.1492 mm on each side.

![Manufactured A13 DDR copper against the applied clearance](board.snap.svg)

The other nine boards keep their applied clearance to within the audit's
0.002 mm drawing tolerance, so this is specific to how A13's rule was chosen,
not to the audit:

| Board | Applied (mm) | Source copper minimum (mm) | Pairs closer than applied |
| --- | ---: | ---: | ---: |
| h3 | 0.0889 | 0.0900 | 0 |
| a64 | 0.10668 | 0.1067 | 0 |
| stmp157 | 0.127 | 0.1270 | 0 |
| orangecrab | 0.089 | 0.0889 | 0 |
| **a13** | **0.2** | **0.1249** | **308** |
| h616 | 0.1 | 0.0989 | 0 |
| butterstick | 0.0889 | 0.0890 | 0 |
| glider | 0.11 | 0.1210 | 0 |
| imx6 | 0.119 | 0.1200 | 0 |
| icepi | 0.1 | 0.0996 | 0 |

From the repository root:

```sh
python3 scripts/source_clearance.py            # all ten boards -> provenance/source-clearance.json
python3 repros/a13-source-clearance/render.py  # board.snap.svg
bun test tests/source-clearance.test.ts
```

The audit downloads each original `.kicad_pcb` at its pinned commit into
`.source-cache/` and verifies it against `manifest.json` before measuring.
Tracks, vias and circle, oval, rectangle and rounded-rectangle pads are measured
exactly against their real outlines. Copper pads of any other shape are listed
per board as `unmeasuredCopperPads` instead of being assumed clear: A13 has
none; OrangeCrab, ButterStick, Glider and i.MX6 have a few custom-shaped pads,
all at least 0.8 mm from the requested nets' copper. No fixture, rule or benchmark code changes here. The original copper is
drawn for reference only and is still removed before routing. This does not
establish DDR timing, skew or impedance compliance.
