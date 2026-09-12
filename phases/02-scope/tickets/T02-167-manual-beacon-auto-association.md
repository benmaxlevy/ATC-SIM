# T02-167: Manual beacon-code automatic association

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-166
**Merge target:** `improvement/db-source-unification`

## Mission

Align the existing pending-plan/runtime beacon correlation with the supplied
Raytheon STARS manual's beacon-match rule. A pending plan with an assigned
beacon code must automatically associate to the corresponding unassociated
aircraft when the runtime receives a matching squawk. Unsupported datablock
creation and the manual's active-plan/unsupported-datablock workflow remain
out of scope.

## Manual research

Authoritative source: `/home/ben/Documents/stars refs/full_manual.pdf`.

- §5.5.9, pp. 5-125–5-126: for an active flight plan with discrete beacon and
  an unsupported datablock, as long as the plan beacon and corresponding
  aircraft squawk match, the track and plan auto-associate when radar detects
  the flight; the datablock moves to the associated track.
- §5.4.1, p. 5-66: successful association makes the plan active and removes it
  from the flight list.
- §5.4.1, p. 5-67: duplicate/invalid identity and already-associated track
  conditions remain rejection cases.

This ticket adopts only the manual's beacon-match rule in the already-shipped
pending-plan/runtime path. It does not implement the manual's unsupported
datablock state. It must not add an ACID or CID requirement to automatic
association. Manual INIT CNTL identity association is covered by T02-166.

## Scope

- Audit and correct event-driven correlation on reported squawk updates and
  other existing aircraft beacon mutation paths.
- Match eligible pending plans by unique assigned beacon code.
- Preserve assigned plan beacon separately from reported aircraft squawk.
- On success, set authoritative `associatedAircraftId`, activate when required,
  and ensure scope projection removes the TAB entry and renders the FDB.
- Keep correlation generic; no facility-specific or CID-based branches.

## Acceptance criteria

- **AC1:** An eligible plan assigned beacon `7022` auto-associates when an
  unassociated aircraft reports squawk `7022`.
- **AC2:** Automatic association succeeds even when aircraft callsign/ACID
  differs from the plan ACID; the supplied manual's §5.5.9 beacon-match rule is
  authoritative for this existing pending-plan trainer path.
- **AC3:** Duplicate pending plans with the same beacon do not auto-associate;
  invalid/VFR `1200` reports do not create an association.
- **AC4:** Association preserves aircraft kinematics and reported squawk;
  assigned beacon remains plan data.
- **AC5:** Successful pending-plan correlation activates the plan, upgrades the
  target to FDB through existing projections, and removes the TAB entry.
- **AC6:** Already-associated, deleted, suspended-ineligible, and other
  existing lifecycle conditions retain their documented behavior.
- **AC7:** CID is never used for automatic association. No INIT Enter path or
  unsupported datablock behavior is added.

## Tests

- Extend `src/core/test/flightPlanCorrelation.test.ts` with beacon-only match,
  ACID mismatch, duplicate beacon, invalid code, and provenance cases.
- Extend the existing scope/lifecycle acceptance test only where needed to
  prove automatic TAB purge and FDB projection.
- Run `npm run ci` after implementation.
- Run `$check-stars-manual` against this ticket and its implementation.

## Likely files

- `src/core/flightPlan.ts`
- `src/core/world.ts`
- existing scenario/runtime squawk mutation adapters
- `src/core/test/flightPlanCorrelation.test.ts`
- existing scope/lifecycle integration test

## Non-goals

- Unsupported datablocks.
- Manual INIT CNTL identity entry or direct Enter behavior.
- CID matching.
- Active-plan/unsupported-datablock automatic acquisition; defer until
  unsupported datablocks are explicitly approved.
- Speech, procedures, handoffs, DCB, or unrelated datablock changes.

## Handoff

Worker returns changed paths, commit IDs, tests, and exactly `READY TO MERGE`
or `BLOCKED`.
