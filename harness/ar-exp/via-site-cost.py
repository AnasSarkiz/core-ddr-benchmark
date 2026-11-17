# Experiment only (applied after split-nodes.patch). VIA_SITE_MODE: split | scale | both | none.
# scale: pathing sees each node's via cost over its legal via-center area instead of its full area.
from pathlib import Path
d = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph")
f = d / "splitNodesWithoutViaSite.ts"
t = f.read_text()
old = "    if (hasViaSite) return [node]\n"
assert t.count(old) == 1
t = t.replace(old, "    if (hasViaSite) return [node]\n    if (!/split|both/.test(process.env.VIA_SITE_MODE ?? \"split\")) return [node]\n")
t += '''
export const annotateViaSiteFraction = ({ nodes, srj, connMap, viaDiameter, viaToPadClearance }: SplitNodesWithoutViaSiteParams): void => {
  const routedNetIds = new Set(srj.connections.map((c) => connMap.getNetConnectedToId(c.name) ?? c.name))
  const isRouted = (o: Obstacle): boolean => [o.obstacleId, ...o.connectedTo].some((id) => { if (!id) return false; const n = connMap.getNetConnectedToId(id); return n !== undefined && routedNetIds.has(n) })
  const keepOut = viaDiameter / 2 + viaToPadClearance
  const hard = srj.obstacles.filter((o) => !isRouted(o)).map((o) => ({ o, b: getObstacleBounds(o), z: o.zLayers ?? o.layers.map((l) => mapLayerNameToZ(l, srj.layerCount)) }))
  let changed = 0
  for (const node of nodes as any[]) {
    if (node._isComponentTopologyNode || node._containsTarget || node._containsObstacle || node.availableZ.length < 2) continue
    const c = { minX: node.center.x - node.width / 2 + viaDiameter / 2, maxX: node.center.x + node.width / 2 - viaDiameter / 2, minY: node.center.y - node.height / 2 + viaDiameter / 2, maxY: node.center.y + node.height / 2 - viaDiameter / 2 }
    if (c.minX > c.maxX || c.minY > c.maxY) { if (process.env.VIA_SITE_SMALL !== "skip") { node._viaSiteFraction = 0; changed++ } continue }
    const near = hard.filter(({ b, z }) => z.some((zz: number) => node.availableZ.includes(zz)) && b.minX - keepOut < c.maxX && b.maxX + keepOut > c.minX && b.minY - keepOut < c.maxY && b.maxY + keepOut > c.minY)
    if (near.length === 0) continue
    const nx = Math.min(30, Math.max(2, Math.ceil((c.maxX - c.minX) / 0.025) + 1))
    const ny = Math.min(30, Math.max(2, Math.ceil((c.maxY - c.minY) / 0.025) + 1))
    let ok = 0
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const p = { x: c.minX + ((c.maxX - c.minX) * i) / (nx - 1), y: c.minY + ((c.maxY - c.minY) * j) / (ny - 1) }
      if (near.every(({ o }) => getPointToObstacleDistance(p, o) >= keepOut)) ok++
    }
    node._viaSiteFraction = ok / (nx * ny)
    changed++
  }
  console.log(`VIASITE annotated=${changed} zero=${(nodes as any[]).filter((n) => n._viaSiteFraction === 0).length}`)
}
'''
f.write_text(t)
p = d / "AutoroutingPipelineSolver9_PreloadedTraceGraph.ts"
t = p.read_text()
old = "          cms.capacityNodes = cms.nodeDimensionSubdivisionSolver!.outputNodes\n"
assert t.count(old) == 1
t = t.replace(old, old + '''          if (/scale|both/.test(process.env.VIA_SITE_MODE ?? "")) annotateViaSiteFraction({ nodes: cms.capacityNodes, srj: cms.srj, connMap: cms.connMap, viaDiameter: cms.viaDiameter, viaToPadClearance: getViaToPadClearance(cms.srj) ?? cms.srj.defaultObstacleMargin ?? 0.15 })
''')
t = t.replace("import { splitNodesWithoutViaSite }", "import { annotateViaSiteFraction, splitNodesWithoutViaSite }")
assert "annotateViaSiteFraction, splitNodesWithoutViaSite" in t
p.write_text(t)
q = Path("lib/solvers/PortPointPathingSolver/tinyhypergraph/TinyHypergraphPortPointPathingSolver.ts")
t = q.read_text()
old = "    width: region.d.width,\n    height: region.d.height,\n    availableZ: [...region.d.availableZ],\n"
assert t.count(old) == 1
t = t.replace(old, "    width: region.d.width * Math.sqrt(Math.max((region.d as any)._viaSiteFraction ?? 1, Number(process.env.VIA_SITE_FLOOR ?? 0.01))),\n    height: region.d.height * Math.sqrt(Math.max((region.d as any)._viaSiteFraction ?? 1, Number(process.env.VIA_SITE_FLOOR ?? 0.01))),\n    availableZ: [...region.d.availableZ],\n")
q.write_text(t)
print("via-site-cost applied")
