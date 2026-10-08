# T04-89 IFR cancellation state and Class B safety remediation

**Phase:** 04 Procedures (satellite traffic remediation)
**Priority:** P0
**Size:** M
**Depends on:** T04-74, T04-75
**Blocks:** T04-91
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Restore VFR navigation correctly after pilot IFR cancellation and invoke the
cancellation scheduler exactly once with its typed callback contract. This does
not add Class B entry approval: cancellation is accepted only outside the full
3D Class B volume, and post-cancellation navigation must remain clear of it.

## Context

The audit found that cancellation leaves `MISSED`/`MISSED_CLIMB` guidance active
and that airborne pickup cancellation scheduling calls the hook twice with
incompatible arguments. Existing T04-75 rules remain authoritative: an aircraft
inside Bravo cannot cancel IFR, and an aircraft without a safe VFR continuation
must remain unchanged.

## Research

- **R01:** FAA JO 7110.65 §4-2-10, cancellation response:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
- **R01:** FAA JO 7110.65 §7-9, Class B services:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R03:** AIM §5-1-15, canceling IFR:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_1.html
- Trainer delta: continuous VMC and deterministic autonomous VFR navigation;
  no Class B clearance or certified separation behavior is modeled.

## Scope

- Clear all active IFR approach/missed guidance on successful acknowledgment,
  including `MISSED` and `MISSED_CLIMB` modes.
- Normalize the cancellation scheduling call to one typed invocation:
  `(aircraft, simTimeMs, options)`.
- Preserve flight plan, beacon, flight-following/service state, and atomic
  rejection behavior.
- Preserve hard 3D Bravo protection: inside-Bravo cancellation rejects with the
  existing exact string; accepted VFR continuation uses swept-path avoidance.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Pending IFR cancellation outside Bravo | Acknowledgment succeeds | VFR navigation resumes; IFR guidance clears | None | JO 7110.65 §4-2-10 |
| Pending cancellation while `MISSED`/`MISSED_CLIMB` | Acknowledgment succeeds outside Bravo | Missed modes clear; VFR continuation becomes active | No residual missed guidance | T04-75 state contract |
| Pending cancellation inside Bravo | Reject atomically | Aircraft remains IFR and unchanged | `CANCELLATION: cannot cancel IFR inside Class B airspace` | JO 7110.65 §7-9 |
| Accepted VFR continuation route | Remains outside Bravo | Swept-path guard applies to every next waypoint/segment | No route through Bravo; no Class B clearance invented | T04-75/T04-80 |
| Airborne pickup candidate | Scheduler invoked once | Correct `(aircraft, simTimeMs, options)` call | No `(world, aircraftId)` legacy call | T04-74 |
| No safe VFR continuation | Reject/withdraw candidate | No partial IFR-to-VFR mutation | Existing safe-continuation error retained | T04-75 |

## Acceptance criteria

- [ ] `MISSED` and `MISSED_CLIMB` are cleared on successful IFR cancellation.
- [ ] Cancellation scheduling uses one correctly typed callback invocation.
- [ ] Cancellation inside any 3D Bravo volume remains rejected and unchanged.
- [ ] Accepted VFR navigation proves no swept-path Bravo entry; no Class B
  approval, exit command, or new airspace service is added.
- [ ] Flight plan, beacon, and current service/following state remain preserved.
- [ ] Typed, spoken, and Path-C cancellation acknowledgment behavior remains
  unchanged.
- [ ] `npm run ci` passes.

## Test plan

- Unit: cancellation state matrix, missed-mode clearing, Bravo rejection, and
  callback invocation count/arguments.
- Integration: airborne pickup → IFR flight → cancellation → VFR continuation,
  including long-path Bravo avoidance.
- Manual: KATL session outside Bravo; verify cancellation, autonomous VFR path,
  and no Bravo penetration. Do not claim Class B clearance support.

## Suggested files

- `src/core/ifrCancellation.ts`
- `src/core/ifrClearance.ts`
- `src/core/world.ts`
- `src/pilot/validate.ts`
- `src/pilot/test/ifrCancellation.test.ts`
- `src/pilot/test/airborneIfrPickup.test.ts`
- `tests/integration/satellite-traffic-acceptance.test.ts`

## Out of scope

- Class B entry clearances, automatic Bravo-exit instructions, tower service,
  new cancellation grammar, or changes to FAA phraseology.
