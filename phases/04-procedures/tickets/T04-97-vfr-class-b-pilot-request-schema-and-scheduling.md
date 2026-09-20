# T04-97 VFR Class B pilot-request schema and scheduling

**Phase:** 04 Procedures (VFR Class B pilot requests)
**Priority:** P0
**Size:** M
**Depends on:** T04-96, T04-85
**Blocks:** T04-98, T04-99
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Extend the generic VFR radio-request model so ambient VFR aircraft can request
Class B access before entering modeled Bravo. Support arrival `TO_ENTER`,
`THROUGH` transition, and departures from airports below a Bravo shelf when the
planned route enters the 3D volume. Do not create pilot `OUT_OF` requests.

## Product law

- `RadioRequestKind` gains `CLASS_B_ACCESS`.
- Class B pilot requests contain only `TO_ENTER` or `THROUGH`.
- Requests require operational VFR and do not authorize entry.
- Aircraft remains clear of Class B until an accepted controller clearance.
- A flight remaining below a Bravo shelf creates no Class B request.
- A primary-airport departure, such as KATL, uses existing departure-clearance
  behavior and does not create a separate pilot `OUT_OF` request.
- Underlying-airport behavior is generic: use modeled airport/route geometry,
  never a KATL branch.

## Research

- **R01:** FAA JO 7110.65 §7-9-2, VFR Class B clearance and approval/denial:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R02:** FAA AIM §3-2-3, VFR Class B arrival, transit, and departure:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap3_section_2.html
- **R03:** FAA AIM §3-5-7, VFR transition routes and secondary-airport
  arrivals/departures:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap3_section_5.html
- **R04:** FAA AIM §4-2-3, initial contact request/position/altitude content:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_2.html

Trainer delta: request scheduling is deterministic virtual-pilot behavior; it
does not claim to model FAA traffic-flow decisions or a tower cab.

## Data contract

Extend `RadioRequestDetails` with Class B-specific fields while preserving the
existing flat request record and generic catalog references:

```ts
classBOperation?: "TO_ENTER" | "THROUGH";
classBIntent?: "ARRIVAL" | "DEPARTURE" | "TRANSITION";
originAirportId?: string;
route?: Array<{ type: "DIRECT"; fixId: string }>;
```

Reuse existing `positionNm`, `altitudeFt`, `headingDeg`,
`destinationAirportId`, and `requestedAltitudeFt`. Route legs must be
catalog-grounded. Do not store visual landmarks, raw airport names as fixes, or
facility-specific route literals.

Add a terminal `CLEARED` request status, with `clearedAtSimMs` and the actual
cleared Class B operation. `isOpenRadioRequest` must exclude `CLEARED` while
preserving existing flight-following `APPROVED` behavior.

## Scheduling and lifecycle

- Schedule only airborne, operational-VFR traffic eligible for the existing VFR
  request queue.
- Arrival to a primary airport: schedule `TO_ENTER` when the projected route
  enters Bravo; retain destination and requested arrival altitude.
- Transition not landing/departing the primary airport: schedule `THROUGH`
  with route/direction and catalog-grounded route legs.
- Departure from an airport below a Bravo shelf: schedule `TO_ENTER` or
  `THROUGH` only when the projected departure route enters Bravo.
- Primary-airport departure: do not schedule `OUT_OF`.
- Withdraw before transmission if the aircraft is no longer eligible or has
  left the modeled operational area. Do not charge the request cap for a
  withdrawn request.
- Duplicate active Class B requests for one aircraft are rejected without a
  second cap charge.

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Airborne VFR arrival route enters Bravo toward KATL-like primary airport | Create `CLASS_B_ACCESS` `TO_ENTER` request | `PENDING`; details preserve destination, position, altitude, direction | Route stays outside/under shelf → no request | R02 §3-2-3 |
| Airborne VFR transition across Bravo | Create `THROUGH` request | `PENDING`; route legs are catalog-grounded | Missing or ungrounded route → no request and no authorization | R03 §3-5-7 |
| VFR departure from airport below a Bravo shelf | Create `TO_ENTER`/`THROUGH` request when route enters volume | `PENDING`; origin and destination remain generic data | Route remains below shelf → no request | R03 §3-5-7 |
| Departure from primary airport | Use existing departure path | No Class B pilot request; no `OUT_OF` request | Must not schedule a pilot `OUT_OF` request | R02 §3-2-3 |
| IFR, non-airborne, or already-authorized aircraft | Skip scheduling | No request, route, flight-rule, service, or beacon mutation | Existing eligibility behavior remains unchanged | Existing VFR eligibility contract |
| Duplicate active Class B request | Do not append a second record | No extra cap charge or audio | Exact `REQUEST: request already pending` | Existing request lifecycle pattern |
| Request becomes ineligible before call | Withdraw request | `WITHDRAWN`, reason `AIRCRAFT_EXITED` or existing equivalent | No cold call/audio | Existing scheduler withdrawal behavior |

## Tests

- Add parameterized synthetic fixtures for arrival, transition, below-shelf
  flight, and underlying-airport departure.
- Test VFR-only eligibility, primary-airport no-`OUT_OF`, no-entry behavior,
  route grounding, duplicate/capacity handling, withdrawal, and seeded repeat.
- Test request list association by aircraft id and stable request id.
- Keep production airport names out of generic unit fixtures; use committed
  regional data only in the integrated acceptance ticket.

## Acceptance criteria

- [ ] `CLASS_B_ACCESS` records support only VFR `TO_ENTER` and `THROUGH`.
- [ ] Arrival, transition, below-shelf, and underlying-airport departure cases
  are generic and geometry-driven.
- [ ] Primary-airport departures never schedule a pilot `OUT_OF` request.
- [ ] Open/withdrawn/duplicate/capacity behavior is deterministic and tested.
- [ ] `CLEARED` is terminal for Class B requests without changing existing
  flight-following `APPROVED` behavior.

## Files

- `src/core/radio/requests.ts`
- `src/pilot/vfrRequestQueue.ts`
- `src/pilot/test/vfrRequestQueue.test.ts`
- `src/core/radio/test/requests.test.ts`

## Out of scope

- Controller parser grammar and `CLEARED AS REQUESTED` (T04-99).
- Direct `say request` formatting (T04-98).
- Controller clearance execution and request resolution (T04-100).
- Class C/D, SVFR, visual landmarks, VFR corridors, tower cab, or phase 5.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including focused tests, changed
paths, request-state evidence, and any manual FAA review status.
