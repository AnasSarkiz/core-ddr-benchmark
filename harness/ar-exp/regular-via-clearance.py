from pathlib import Path

d = Path("lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph")

def edit(path, old, new):
    p = Path(path)
    t = p.read_text()
    assert t.count(old) == 1, (path, old[:80], t.count(old))
    p.write_text(t.replace(old, new))

fb = d / "Pipeline9RegionalFallbackSolver.ts"
edit(fb, '''const hasPreloadedViaToBoardObstacleConflict = ({
  routes,
  movablePreloadedConnectionNames,
  boardObstacles,
  connMap,
  layerCount,
  viaToPadClearance,
  allowBlindAndBuriedVias,
}: {
  routes: HighDensityRoute[]
  movablePreloadedConnectionNames: ReadonlySet<string>
  boardObstacles: Obstacle[]
  connMap: ConnectivityMap
  layerCount: number
  viaToPadClearance: number
  allowBlindAndBuriedVias?: boolean
}): boolean =>
  routes.some((route) => {
    if (!movablePreloadedConnectionNames.has(route.connectionName)) {
      return false
    }
    const viaSpans''', '''export const hasViaToBoardObstacleConflict = ({
  routes,
  boardObstacles,
  connMap,
  layerCount,
  viaToPadClearance,
  allowBlindAndBuriedVias,
}: {
  routes: HighDensityRoute[]
  boardObstacles: Obstacle[]
  connMap: ConnectivityMap
  layerCount: number
  viaToPadClearance: number
  allowBlindAndBuriedVias?: boolean
}): boolean =>
  routes.some((route) => {
    const viaSpans''')
edit(fb, '''    const hasViaConflict = hasPreloadedViaToBoardObstacleConflict({
      routes,
      movablePreloadedConnectionNames,''', '''    const hasViaConflict = hasViaToBoardObstacleConflict({
      routes: routes.filter((route) =>
        movablePreloadedConnectionNames.has(route.connectionName),
      ),''')

hd = d / "Pipeline9HighDensitySolver.ts"
edit(hd, '''import { Pipeline9RegionalFallbackSolver } from "./Pipeline9RegionalFallbackSolver"''', '''import {
  hasViaToBoardObstacleConflict,
  Pipeline9RegionalFallbackSolver,
} from "./Pipeline9RegionalFallbackSolver"''')
edit(hd, '''  priorityDiagnostics?: Record<string, number>
  captureSearchDebug?: boolean
  layerCount: number
}
''', '''  priorityDiagnostics?: Record<string, number>
  captureSearchDebug?: boolean
  layerCount: number
  solutionValidator?: (routes: HighDensityIntraNodeRoute[]) => boolean
}
''')
edit(hd, '''  boardGeometry,
  layerCount,
}: Pipeline9RegularNodeSolverParams): HighDensitySolver =>''', '''  boardGeometry,
  layerCount,
  solutionValidator,
}: Pipeline9RegularNodeSolverParams): HighDensitySolver =>''')
edit(hd, '''    minViaHoleEdgeToViaHoleEdgeClearance,
    allowBlindAndBuriedVias,
  })

/**
 * Uses Pipeline7's detailed solver''', '''    minViaHoleEdgeToViaHoleEdgeClearance,
    allowBlindAndBuriedVias,
    growShrinkSolutionValidator: solutionValidator,
  })

/**
 * Uses Pipeline7's detailed solver''')
edit(hd, '''  protected startRegularSolver(node: NodeWithPortPoints): void {
    this.activeNode = node
    this.activeRegularSolver = createPipeline9RegularNodeSolver({''', '''  protected startRegularSolver(node: NodeWithPortPoints): void {
    this.activeNode = node
    // Ordinary node solvers ignore board copper, and grow/shrink retries can
    // leave via copper outside the node. Reject vias that reach unconnected
    // board copper within the declared via-to-pad clearance.
    const viaToPadClearance = this.viaToPadClearance
    const nearbyBoardObstacles =
      viaToPadClearance === undefined
        ? []
        : this.obstacles.filter((obstacle) =>
            obstacleOverlapsNode(
              obstacle,
              getNodeBounds(node, this.viaDiameter / 2 + viaToPadClearance),
            ),
          )
    this.activeRegularSolver = createPipeline9RegularNodeSolver({''')
edit(hd, '''      priorityDagSearch: true,
      captureSearchDebug: this.params.captureSearchDebug,
    })
    this.stats.regularNodeCount''', '''      priorityDagSearch: true,
      captureSearchDebug: this.params.captureSearchDebug,
      solutionValidator:
        viaToPadClearance === undefined || nearbyBoardObstacles.length === 0
          ? undefined
          : (routes): boolean =>
              !hasViaToBoardObstacleConflict({
                routes,
                boardObstacles: nearbyBoardObstacles,
                connMap: this.connMap,
                layerCount: this.layerCount,
                allowBlindAndBuriedVias: this.allowBlindAndBuriedVias,
                viaToPadClearance,
              }),
    })
    this.stats.regularNodeCount''')
print("applied regular-via-clearance")
