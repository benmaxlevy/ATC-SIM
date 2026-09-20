# T04-95 VFR Class B clearance state and execution

**Phase:** 04 Procedures (VFR Class B clearance)
**Priority:** P0
**Size:** L
**Depends on:** T04-94
**Blocks:** T04-96
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Apply explicit VFR Class B clearances, maintain an explicit no-entry
restriction, execute catalog-grounded routes, validate complete 3D swept paths,
and emit deterministic clearance/boundary/conformance events.

## Product law

- Class B entry is authorized only by accepted `CLASS_B_CLEARANCE`.
- `REMAIN_OUTSIDE_BRAVO` authorizes no entry and keeps the aircraft outside.
- Flight following, radar contact, `MAINTAIN_VFR`, and IFR cancellation never
  authorize Class B entry.
- All supported clearances require operational VFR. They never transition an
  aircraft to IFR or modify the editable flight plan.
- A Class B-specific altitude assignment is temporary. Preserve the aircraft's
  prior VFR altitude behavior so `RESUME_APPROPRIATE_VFR_ALTITUDES` can restore
  it when the assignment is no longer needed.
- Rejected commands mutate nothing.
- Existing outside-Bravo IFR cancellation replanning remains unchanged.

## Research

- **R01:** FAA JO 7110.65 §7-9-2, Class B clearance and exit notification:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R01:** FAA JO 7110.65 §7-9-3, vectors and leaving/reentering Class B, same source.
- **R01:** FAA JO 7110.65 §7-9-7, altitude assignments, same source.
- **R03:** AIM §3-2-3, entry, transit, and departure rules:
  https://www.faa.gov/air_traffic/publications/aim_html/chap3_section_2.html

Trainer delta: route execution is deterministic trainer behavior over imported
regional geometry. It is not FAA route automation or certified separation.

## State contract

Add generic aircraft state, without facility branches:

```ts
classBClearance?: {
  operation: "THROUGH" | "TO_ENTER" | "OUT_OF";
  routeFixIds?: string[];
  routeMode: "CATALOG_ROUTE" | "OWN_NAVIGATION";
  altitudeFt?: number;
  priorVfrAltitudeFt?: number;
  issuedAtSimMs: number;
  routeIndex: number;
  active: boolean;
};

remainOutsideBravo?: {
  issuedAtSimMs: number;
  active: boolean;
};
```

`classBClearance` remains active across a temporary exit/reentry when the
planned route requires it. `OUT_OF` terminates after the aircraft exits.
`REMAIN_OUTSIDE_BRAVO` terminates only when explicitly superseded or when the
aircraft leaves the modeled operational area.

The system emits only FAA-supported exit notification:

```text
LEAVING (name) BRAVO AIRSPACE.
```

Emit it when the aircraft crosses out of Class B. If spacing requires leaving
and reentering, emit leaving/reentry boundary events and notification as
required by §7-9-3. If the clearance carried a Class B-specific altitude
assignment, also generate the equivalent controller instruction `RESUME
APPROPRIATE VFR ALTITUDES` when that assignment is no longer needed, including
on exit. Do not automatically append `RADAR SERVICE TERMINATED`, `SQUAWK ONE
TWO ZERO ZERO`, or other optional phraseology.

## Validation and execution

- Require `aircraft.flightRules === "VFR"` and reject active operational IFR.
- `TO_ENTER` requires the aircraft currently outside Class B.
- `OUT_OF` requires the aircraft currently inside Class B.
- Explicit `TO_ENTER`/`THROUGH` routes must intersect the requested Class B
  volume and satisfy the requested operation. `OUT_OF` routes must exit it.
- Build route geometry from current aircraft position through every catalog route
  fix. Validate every endpoint and swept 3D segment against grouped Class B
  geometry.
- A clearance route is allowed to intersect Class B; the geometry check proves
  the requested entry/through/exit semantics. The existing no-entry predicate
  applies only when no active authorization exists.
- An altitude-bearing clearance requires available minimum-altitude data and an
  altitude meeting the applicable MVA/MSA/minimum IFR/91.119 contract. Do not
  invent a minimum. Altitude-free clearances preserve own VFR altitude.
- `RESUME_APPROPRIATE_VFR_ALTITUDES` requires VFR and a saved active Class B
  altitude assignment. Restore the saved VFR altitude behavior, clear the
  clearance-owned altitude, and make no route, flight-rule, beacon, plan,
  flight-following, or radar-service change. Automatic exit handling uses the
  same state transition without reparsing a generated string.
- `REMAIN_OUTSIDE_BRAVO` requires the current aircraft point and remaining route
  to be outside. If the current route is unsafe, use the existing deterministic
  VFR continuation planner; if no safe continuation exists, reject atomically.
- Existing `H`, `DCT`, and other controller route commands remain available. With
  active authorization, they are explicit route amendments and update
  conformance. Without authorization, they cannot produce a Class B entry.
- No hidden route repair, flight-rule transition, flight-plan edit, beacon edit,
  flight-following edit, or radar-service termination.

Exact proposed rejection details:

| Condition | Detail |
| --- | --- |
| IFR or active operational IFR clearance | `CLEARANCE: VFR aircraft required` |
| `TO_ENTER` while already inside | `CLEARANCE: aircraft is already inside Class B airspace` |
| `OUT_OF` while outside | `CLEARANCE: aircraft is not inside Class B airspace` |
| Route does not satisfy operation | `CLEARANCE: route does not satisfy Class B clearance` |
| Invalid altitude data/assignment | `CLEARANCE: altitude does not meet Class B minimums` |
| `REMAIN_OUTSIDE` while inside | `CLEARANCE: aircraft is inside Class B airspace` |
| No safe remain-outside continuation | `CLEARANCE: unable to remain outside Bravo` |
| Resume requested without a saved Class B altitude assignment | `CLEARANCE: no Class B altitude assignment to resume` |

## Events

Emit through the existing session log:

- `class_b.clearance.issued` — controller command attempt.
- `class_b.clearance.accepted` — state transaction committed.
- `class_b.clearance.rejected` — validation failed; includes exact detail.
- `class_b.entered` — first authorized boundary entry.
- `class_b.exited` — boundary exit; includes FAA-required notification payload.
- `class_b.route_deviation` — active explicit route no longer matches.
- `class_b.altitude.resumed` — saved VFR altitude behavior restored by the
  explicit instruction or the required exit transition.

Events must include aircraft id, callsign, sim time, operation, route/altitude
projection, and source command where applicable.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| VFR `TO_ENTER` outside Bravo | Accepted | Authorization active; own nav or route mode selected | Already inside → exact `CLEARANCE` error | R01 §7-9-2 |
| VFR `THROUGH` with catalog route | Accepted | Complete 3D route executes through Bravo | Route does not enter/exit as required → atomic rejection | R01 §§7-9-2/3 |
| VFR `OUT_OF` inside Bravo | Accepted | Route executes until exit; clearance ends | Outside at issue → exact `CLEARANCE` error | R01 §7-9-2; AIM §3-2-3 |
| `MAINTAIN 3000 WHILE IN BRAVO AIRSPACE` | Accepted with valid minima | Assigned altitude applies only to clearance state | Missing/invalid MVA data or unsafe altitude → exact rejection | R01 §7-9-7 |
| `RESUME APPROPRIATE VFR ALTITUDES` with saved assignment | Accepted | Restores prior VFR altitude behavior and clears the Class B assignment | No saved assignment or IFR → exact `CLEARANCE` error; no other state changes | R01 §7-9-7 |
| `REMAIN OUTSIDE BRAVO AIRSPACE` outside | Accepted | Restriction active; safe existing/replanned VFR suffix | Inside or no safe continuation → atomic rejection | R01 §7-9-2 |
| No clearance, autonomous route intersects Bravo | Blocked | Existing avoidance remains active | No `flightRules`, route, or plan mutation | Backlog/Class B contract |
| Active authorization plus `H`/`DCT` amendment | Accepted if operation remains valid | Route conformance updated | Invalid new path → atomic rejection; no implicit repair | R01 §§7-9-2/3 |
| Aircraft crosses boundary out | Boundary transition | `class_b.exited`; emit `LEAVING (name) BRAVO AIRSPACE` | No duplicate event while outside | R01 §§7-9-2/3 |
| Rejected command | Rejection | Aircraft, route, plan, beacon, service unchanged | Exact detail retained | Atomicity test |

## Acceptance criteria

- [ ] All supported Class B commands require operational VFR and preserve VFR.
- [ ] Valid enter/through/out routes execute from generic regional geometry.
- [ ] `REMAIN_OUTSIDE_BRAVO` actively preserves no-entry behavior and can use
  only the existing deterministic safe-continuation planner.
- [ ] Full grouped 3D swept-path validation covers current point, endpoints,
  shelves, fragmented volumes, and vertical floors/ceilings.
- [ ] Altitude-bearing clearance validates available minimum-altitude data.
- [ ] `RESUME_APPROPRIATE_VFR_ALTITUDES` restores saved VFR altitude behavior
  only when a Class B-specific assignment exists; exit handling emits it only
  when required.
- [ ] Exit notification occurs exactly when FAA rules require it; optional
  service/squawk actions remain separate.
- [ ] Heading/direct amendments never change flight rules or imply IFR.
- [ ] Rejections are atomic with exact details.
- [ ] Flight plan, beacon, flight-following, and radar-contact state remain intact.

## Test plan

- Pure geometry tests: enter, through, out, route mismatch, shelf crossing,
  vertical crossing, grouped fragmented volumes, and boundary event dedupe.
- Pilot tests: VFR-only guards, remain-outside planner, route amendments,
  altitude-minimum rejection, resume/exit altitude restoration, and atomic
  rollback.
- Regression: IFR cancellation, flight following, radar contact, `MAINTAIN_VFR`,
  beacon, and editable flight-plan preservation.
- Manual: regional session proving VFR entry, through transit, exit notification,
  remain-outside denial, and no automatic service/squawk changes. Review JO
  7110.65 §§7-9-2, 7-9-3, 7-9-7 and AIM §3-2-3.

## Suggested files

- `src/core/aircraft.ts`
- `src/core/world.ts`
- `src/core/vfrNavigation.ts`
- `src/core/vfrClassBClearance.ts`
- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/handleRadioText.ts`
- `src/pilot/readback.ts`
- `src/core/events/session-log.ts`
- `src/core/test/vfrNavigation.test.ts`
- `src/pilot/test/classBclearance.test.ts`

## Out of scope

- `CLEARED AS REQUESTED` request lifecycle.
- Class C/D, SVFR, VFR-on-top, visual landmarks, and VFR corridors.
- Certified separation, terrain/weather modeling, tower cab, and multi-position
  coordination.
- Automatic `RADAR SERVICE TERMINATED` or `SQUAWK ONE TWO ZERO ZERO`.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including focused test results,
changed paths, event evidence, and manual review status.
