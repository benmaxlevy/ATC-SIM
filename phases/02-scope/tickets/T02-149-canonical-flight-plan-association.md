# T02-149 Canonical flight-plan association

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-145  
**Blocks:** T02-150, T02-151, T02-152  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make `FlightPlan.associatedAircraftId` the only authoritative target↔plan relationship and remove duplicate `Aircraft.flightPlanId` state.

## Research

- Supplied `full_manual.pdf`, §2.12, pp. 2-58–2-70: associated and unassociated tracks have distinct datablock behavior.
- Supplied `full_manual.pdf`, §5.4.1, pp. 5-66–5-67: association is a discrete selected-track operation.
- Supplied `full_manual.pdf`, §5.5.7, pp. 5-116–5-119: a pending plan with a discrete beacon is not itself proof of association.
- Event-driven squawk correlation is an ATC-SIM trainer policy; the manual does not prescribe background correlation.

## Scope

- Remove `Aircraft.flightPlanId` and association-copy aliases used as authority; centralize association, disassociation, and lookup around the plan-side relationship.
- Enforce one aircraft per plan and one associated plan per aircraft.
- Keep `Aircraft.squawk` as reported surveillance evidence and `FlightPlan.assignedBeacon` as plan data; never overwrite reported squawk during association.
- Update callers and fixtures to use the canonical resolver.

## Out of scope

- New squawk mutation paths, pilot execution, periodic/list/render correlation, route flying, handoffs, and networking.

## Acceptance criteria

- [ ] No production path uses `Aircraft.flightPlanId` as an association source.
- [ ] Association and disassociation update only the plan-side relationship and reject contradictory second associations.
- [ ] Disassociation leaves reported squawk and kinematics unchanged.
- [ ] An unassociated target never inherits a plan callsign merely because identity fields match.
- [ ] Tests cover association, disassociation, duplicate target/plan, and reported-versus-assigned beacon separation.

## Test plan

- `npm run ci`; focused flight-plan lifecycle tests.

## Suggested files

- `src/core/flightPlan.ts`, `src/core/world.ts`, `src/scope/systemLists.ts`, `src/scope/ppi.ts`, `src/scope/trackDisplay.ts`
