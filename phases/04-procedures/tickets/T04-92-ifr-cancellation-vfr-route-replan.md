# T04-92 IFR cancellation VFR route replanning

**Phase:** 04 Procedures (satellite traffic follow-up)
**Priority:** P0
**Size:** M
**Depends on:** T04-75, T04-89
**Blocks:** T04-93
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Allow a pending pilot-initiated IFR cancellation to succeed when the aircraft
is outside modeled Class B but its current autonomous VFR route would enter
Class B. Before the IFR-to-VFR transition, produce a deterministic replacement
route around the modeled three-dimensional Class B volumes. Keep cancellation
inside Class B rejected, and do not add Class B entry approval.

## Context

T04-75 correctly protects Class B entry but currently treats an unsafe existing
VFR continuation as a reason to reject cancellation. That conflates “the
current route is unsafe” with “no safe VFR continuation exists.” The aircraft
should remain IFR only when it is already inside Bravo or no replacement route
can be constructed.

The planner must be pure and shared by candidate validation, command
validation, and state application. Validation must not mutate aircraft state;
application must compute the same deterministic result before making its atomic
state transition.

## Research

- **R01:** FAA JO 7110.65 §4-2-10 requires the controller response
  `(Call sign) IFR CANCELLATION RECEIVED` and permits continuation instructions:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
- **R03:** AIM §5-1-15 permits IFR cancellation while operating VFR outside
  Class A and notes the separate VFR operating procedures:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_1.html
- **R01:** FAA JO 7110.65 §7-9-2 requires an ATC clearance for VFR operation
  in Class B. This ticket therefore keeps inside-Bravo cancellation rejected and
  does not authorize entry:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **Trainer delta:** route replanning is deterministic trainer behavior using
  imported regional geometry; it is not a claim of FAA route automation or
  certified airspace/separation behavior.

## Scope

- Add or extract one pure continuation planner beside the existing swept-route
  predicates. It returns a safe continuation plan or `null` when none exists.
- Route resolution order is deterministic:
  1. Preserve the current remaining ambient VFR route when its complete swept
     3D path is safe.
  2. If the current route is unsafe and an ambient destination/mission target
     exists, rebuild the remaining route to that same target using the existing
     generic target geometry and ordered dogleg candidates of 6, 12, 18, 24,
     and 30 NM on both sides.
  3. If no target exists and the current unsafe route cannot be replaced, return
     `null`; do not invent a random outbound route or silently enter Bravo.
- Validate the current aircraft point, every endpoint, and every swept segment
  against all grouped/fragmented Class B avoidance volumes with existing
  horizontal and vertical margins.
- When a replacement is returned, preserve mission, destination, runway,
  phase, waypoint metadata, flight-following state, beacon state, and editable
  flight-plan state. Replace only the remaining `ambientVfr.waypoints` and set
  `waypointIndex` to the first replacement waypoint.
- Make `defaultIfrCancellationValidator`, the default path in
  `validateInstructions`, and `applyIfrCancellation` use the same planner.
  Preserve the existing injectable validator as a test seam, but production
  default behavior must not approve a cancellation that application cannot
  apply.
- Keep all existing rejection guards: not IFR, no active IFR clearance, no
  pending pilot report, on ground, inside Class B, captured/final automatic
  candidate suppression, and no safe replacement route.
- Keep exact rejection text for no safe continuation:
  `CANCELLATION: unable to establish safe VFR continuation`.
- Preserve atomicity: planner failure leaves flight rules, clearance,
  cancellation marker, intent, route, service, beacon, and flight plan
  unchanged. Planner success commits route replacement and existing IFR
  cancellation state clearing as one operation.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Pending airborne IFR cancellation outside Bravo; current suffix is safe | Acknowledgment succeeds | VFR transition and existing suffix remain; IFR clearance/guidance clear | No route rewrite when current suffix already passes swept check | JO 7110.65 §4-2-10 |
| Pending airborne IFR cancellation outside Bravo; current suffix crosses Bravo but destination/mission target has a safe dogleg | Acknowledgment succeeds | Remaining ambient waypoints replaced; index resets to replacement start; aircraft remains outside Bravo | Direct candidate may fail; ordered dogleg candidate must be tried | JO 7110.65 §4-2-10; trainer route-planning delta |
| Pending airborne IFR cancellation outside Bravo; unsafe suffix and no target/safe replacement | Rejection remains atomic | Aircraft remains IFR with original route and clearance | `CANCELLATION: unable to establish safe VFR continuation` | Synthetic no-target test |
| Pending cancellation while aircraft is inside any 3D Bravo volume | Rejection remains atomic | Aircraft remains IFR; no route rewrite | `CANCELLATION: cannot cancel IFR inside Class B airspace` | JO 7110.65 §7-9-2 |
| Candidate scheduler evaluates outside aircraft with unsafe current suffix but safe replacement | Pilot cancellation report is emitted | Candidate becomes transmitted/pending; no premature VFR mutation | Must not withdraw `NO_SAFE_CONTINUATION` solely because old suffix is unsafe | Queue regression test |
| Validation probes a successful replacement | Validation returns `{ ok: true }` | No aircraft, route, plan, or service mutation | Apply recomputes same deterministic plan before mutation | Validator purity test |
| Accepted cancellation with flight following and discrete beacon | VFR navigation resumes | Flight following and beacon remain unchanged; editable flight plan deep-equal | No automatic `SQ VFR` or radar-service termination | Existing T04-75 service-isolation contract |

## Acceptance criteria

- [ ] An outside-Bravo aircraft with an unsafe existing VFR suffix succeeds
  when the deterministic replacement planner finds a safe route.
- [ ] The replacement route passes the full 3D swept-path Class B check,
  including grouped fragmented volumes, before state mutation.
- [ ] Candidate validation, command validation, and application share the
  planner contract; validation does not mutate state.
- [ ] An aircraft inside Class B remains IFR and unchanged with the existing
  exact rejection string.
- [ ] No safe replacement keeps the aircraft IFR and unchanged with the
  existing exact rejection string.
- [ ] Mission/destination/runway metadata, flight following, beacon, and
  editable flight plan remain preserved.
- [ ] Automatic `ON_APPROACH_FINAL` candidate suppression remains unchanged.
- [ ] No new Command IR instruction, parser grammar, Class B approval, or
  automatic Bravo-exit instruction is added.
- [ ] Focused tests and `npm run ci` pass.

## Test plan

- **Unit:** pure planner preserves a safe suffix; rewrites a direct crossing
  with deterministic doglegs; rejects no-target/no-safe-route; handles grouped
  fragmented shelves and vertical floors/ceilings.
- **Pilot:** candidate validator, `validateInstructions`, and
  `applyIfrCancellation` agree on success/failure and preserve atomicity.
- **Regression:** inside-Bravo rejection, approach-final candidate suppression,
  flight-following/beacon/flight-plan preservation, and existing cancellation
  parser behavior.
- **Manual:** KATL-style synthetic/regional session outside Bravo with a route
  aimed through Bravo; observe pilot cancellation, VFR transition, and a
  visibly redirected path that never enters modeled Bravo. Repeat inside Bravo
  and verify cancellation remains rejected. Record seed/callsign and do not
  claim Class B clearance support.

## Suggested files

- `src/core/vfrNavigation.ts`
- `src/core/ifrCancellation.ts`
- `src/pilot/vfrRequestQueue.ts`
- `src/pilot/validate.ts`
- `src/core/test/vfrNavigation.test.ts`
- `src/pilot/test/ifrCancellation.test.ts`
- `src/pilot/test/vfrRequestQueue.test.ts`

## Out of scope

- Controller-issued VFR clearances through/into Class B.
- Any new Command IR, typed/spoken/Path C grammar, or speech-api change.
- Cancellation inside Class B, automatic Bravo entry/exit, or Class B approval.
- New random route generation, facility-specific branches, terrain/weather,
  tower cab behavior, or full flight-plan editing.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including focused test results,
changed paths, and any manual evidence not run.
