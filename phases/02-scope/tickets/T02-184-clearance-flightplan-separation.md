# T02-184 Clearance/flight-plan separation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-180, T02-181, T02-183  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Keep the editable/filed flight plan independent from an issued IFR clearance.
An IFR clearance may use the current plan as input, but issuing it must create
or replace only the aircraft's active clearance/execution state. The controller
may edit the plan before or after issuing a clearance; no ordering check is
permitted. The aircraft immediately follows the cleared route or enters the
documented radar-vector pending state.

This is the product correction to the earlier one-route implementation: a
clearance is an operational instruction, not a flight-plan edit.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Plan route `VOR1`; `CLR TO KAHN VIA DIRECT` | compile and issue clearance | active clearance snapshot is `KAHN`; aircraft follows it immediately | unknown limit/route rejects atomically | JO 7110.65 §4-2-1, §4-2-5 |
| `CLR TO KAHN VIA DIRECT` then edit plan to `SIITH` | active clearance remains `KAHN` | plan contains only the later manual edit; aircraft does not retarget | no implicit re-clearance | supplied manual §5.5.5, §5.6.17 |
| edit plan to `KAHN` then issue clearance | issue from latest plan input | plan remains byte/deep-equal before/after issuance; aircraft follows independent snapshot | no required “file first” sequence check | JO §4-2-1 |
| `CLR TO KAHN VIA RADAR VECTORS` | issue clearance | active clearance limit/access stored; aircraft is `VECTOR_PENDING` and holds heading | no automatic route turn | JO §5-6-2 |
| optional `ALT`, `FREQ`, `CVIA`, `SQ` | apply operational aircraft state | altitude/frequency/vertical/transponder state updates only; no plan field changes; `SQ` obeys T02-183 | invalid optional is atomic | JO §4-3-2/3, §5-2-1 |
| `CLEARED DIRECT VOR1` / `PROCEED DIRECT VOR1` | tactical lateral instruction | aircraft intent changes only; active clearance and plan route remain unchanged | airport-only identifiers remain invalid direct fixes | JO §4-2-5 |
| malformed or unavailable clearance | reject | plan, active clearance, aircraft intent, and optional state remain unchanged | exact existing `UNABLE_ROUTE`/validation result preserved | JO §4-2-1 |

## Scope

- Add an explicit active-clearance route/state projection separate from
  `FlightPlan.routeRecord`, `filedRoute`, `route`, and plan clearance metadata.
  Reuse the existing catalog route compiler, but copy its result into the
  clearance-owned record with an independent revision/lifecycle/next-index.
- Make `applyIfrClearance` transactional: validate against the current plan,
  then update only aircraft clearance/execution state, aircraft intent, and
  the clearance event. Do not assign any `FlightPlan` route, clearance,
  altitude, or beacon fields.
- Ensure route execution consumes the active-clearance snapshot. SID/STAR and
  fix-then-direct snapshots execute immediately; radar vectors remain pending
  until a later vector. A later flight-plan edit must not mutate the snapshot.
- Keep airport clearance limits executable without putting airport ICAOs in
  `FixRegistry`: provide a separate catalog-backed airport endpoint lookup
  (with synthetic coordinates in tests) for the active-clearance FMS. Airport
  geometry must not become eligible for tactical `DIRECT`/`CROSS` grounding.
- Preserve current `AS FILED` validation as a check against the plan used at
  issuance; it is not a copy operation and does not bind future plan edits.
- Preserve tactical `DIRECT`/`PROCEED DIRECT` as lateral-only instructions.
- Keep optional clearance `SQ` aircraft-only per T02-183 and keep VFR pickup,
  airfile, holds, release/void, and broad route amendments deferred.

## Non-goals

No airborne VFR-to-IFR pickup/airfile, no automatic flight-plan creation, no
beacon allocation, no plan/clearance synchronization watcher, no release/void
or EFC, and no new Command IR syntax.

## Acceptance criteria

- [x] Issuing any valid IFR clearance leaves a deep snapshot of the editable
  flight plan unchanged, including `routeRecord`, `filedRoute`, `route`,
  `assignedAltitudeFt`, `assignedBeacon`, and prior plan clearance metadata.
- [x] A valid clearance creates/replaces an aircraft-owned active-clearance
  route snapshot and applies the corresponding immediate route/vector intent.
- [x] A catalog airport limit can be executed through the separate airport
  endpoint lookup while airport ICAOs remain absent from `FixRegistry` and
  invalid for tactical direct/cross commands.
- [x] Editing a plan after issuance does not alter active-clearance route IDs,
  procedure identity, access, limit, or vector-pending state.
- [x] Issuing after a plan edit uses the latest plan as compiler input without
  requiring a prior clearance or mutating the plan during issuance.
- [x] Invalid clearance remains atomic and does not replace an existing active
  clearance or mutate plan/aircraft state.
- [x] Existing tactical direct, SID, STAR, AS FILED, vector, optional-field,
  and squawk provenance behavior remains green.

## Test plan

Add synthetic domain tests for:

1. plan-before-clearance and clearance-before-plan-edit orderings;
2. deep plan immutability across route, metadata, altitude, and beacon fields;
3. active snapshot stability after a subsequent plan transaction;
4. replacement by a later clearance and atomic rejection with an existing
   active snapshot;
5. direct/SID/STAR/fix-then-direct/vector execution and optional fields;
6. no regression in T02-183 mismatch/correlation behavior.

Run focused route/clearance tests, `npm run ci`, and the supplied manual/FAA
review. Manual checklist: JO 7110.65 §4-2-1, §4-2-5, §4-3-2/3, §5-2-1, and
§5-6-2; supplied STARS manual §5.5.5 and §5.6.17. Any trainer-only
separation rule must be labeled as an ATC-SIM product contract, not FAA
phraseology.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with commit, focused
tests, full CI result, and manual/FAA review notes. No merge or push by worker.
