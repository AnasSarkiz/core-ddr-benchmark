import type { PendingRoutingAccess, SimpleRouteJson } from "./types"

type PhysicalRuleName = Exclude<
  keyof PendingRoutingAccess,
  "connections" | "buses"
>

const PHYSICAL_RULE_NAMES: PhysicalRuleName[] = [
  "minTraceWidth",
  "minTraceToPadEdgeClearance",
  "minViaEdgeToPadEdgeClearance",
  "minViaPadDiameter",
  "minViaHoleDiameter",
  "minViaHoleEdgeToViaHoleEdgeClearance",
  "minPadEdgeToPadEdgeClearance",
  "minBoardEdgeClearance",
  "allowViaInPad",
  "allowBlindAndBuriedVias",
]

/** A request that routes the current buses together with the later buses the
 * caller still has to route. Laying out one bus without the next can leave
 * the next one no legal carrier: an earlier byte's carriers may enclose every
 * via site of a later byte. Only later phases with the current request's
 * physical rules are planned with it, since one request carries one rule set.
 * The caller returns only the current connections' copper; the later buses are
 * routed again by their own phases. Returns undefined when there is nothing to
 * plan with. Board coordinates in mm, +X right, +Y up. */
export function getPlanWithPendingBuses(
  input: SimpleRouteJson,
): SimpleRouteJson | undefined {
  if (!input.buses?.length) return undefined
  const plannable = (input.pendingRoutingAccess ?? []).filter(
    (access) =>
      access.buses?.length &&
      PHYSICAL_RULE_NAMES.every(
        (rule) => access[rule] === undefined || access[rule] === input[rule],
      ),
  )
  if (!plannable.length) return undefined
  const { pendingRoutingAccess: _pending, ...current } = input
  return {
    ...current,
    connections: [
      ...input.connections,
      ...plannable.flatMap((access) => access.connections),
    ],
    buses: [...input.buses, ...plannable.flatMap((access) => access.buses!)],
  }
}
