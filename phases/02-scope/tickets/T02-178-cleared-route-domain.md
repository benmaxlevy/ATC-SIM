# T02-178 Cleared-route domain and lifecycle

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-176, T02-177  
**Blocks:** T02-179, T02-180  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Create one generic proposed/current route record. A new IFR clearance can
activate or replace it atomically; no second filed-versus-cleared route exists.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| existing plan route + clearance | current cleared route | revision/lifecycle event | unknown catalog route -> no mutation | JO §4-2-1 |
| `AS FILED` source | current proposal is cleared | same route, new revision | blank -> `unable route` | §4-3-3 |
| plan creation only | proposal remains inactive | no FMS/intent | never auto-activate | trainer law |

## Scope

- Define catalog-resolved route, next index, revision, and lifecycle
  `none|issued|acknowledged|active|cancelled`.
- Migrate `FlightPlan.filedRoute` at compatibility boundary; modal/scenario
  display stays supported but no duplicate live source is added.
- Provide pure atomic validation/transaction helpers. Assigned/reported beacon,
  VFR and direct actions never change this lifecycle.

## Non-goals

Parser syntax, route flying, direct behavior, airfile/pickup, holds/release,
or route amendment phraseology.

## Acceptance criteria

- [x] One data-first route model supports all current catalog shapes.
- [x] Unknown route/fix/procedure/transition returns `unable route` with world,
  plan, and aircraft unchanged.
- [x] Existing modal/scenario/correlation contracts survive; no route runs yet.

## Test plan

Synthetic catalog route/lifecycle/revision/rollback units; T02-170–175
regressions; manual JO §4-2-1/§4-3-3 review.

## Suggested files

`src/core/flightPlan.ts`, `src/scenario/ifrFlightPlan.ts`, procedure helpers,
core/scenario tests.
