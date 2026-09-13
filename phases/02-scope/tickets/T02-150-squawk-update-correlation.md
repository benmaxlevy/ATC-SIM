# T02-150 Aircraft squawk-update correlation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-149  
**Blocks:** T02-151, T02-152  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make a squawk update the aircraft-by-aircraft trigger for unique pending-plan correlation, with no global or render-time auto-association.

## Research

- Supplied `full_manual.pdf`, §5.5.7, pp. 5-116–5-119: pending plans with discrete beacons and activation/association are distinct states.
- Supplied `full_manual.pdf`, §5.6.15, p. 5-164: beacon release is a plan operation and must not rewrite surveillance evidence.
- Automatic event-driven correlation is a trainer delta, not a manual requirement; preserve manual-visible states.

## Scope

- Add one aircraft-scoped reported-squawk update helper/listener and route every currently writable in-scope update through it.
- On update, match only pending plans with the same valid discrete assigned beacon; associate exactly one unique candidate.
- Leave zero candidates, duplicate candidates, invalid codes, and `1200` unassociated; never guess or scan unrelated aircraft.
- Remove correlation from list getters, render paths, and periodic/tick paths.
- Extend the existing association subsection of `phases/LATER-IMPLEMENTATION-BACKLOG.md` with unreachable future pilot/surveillance/replay/import squawk sources.

## Out of scope

- Pilot clearance execution, global reconciliation, duplicate beacon detection, and CSMM.

## Acceptance criteria

- [ ] Updating aircraft A can associate A to one unique matching plan and never aircraft B.
- [ ] No match, multiple matches, `1200`, and invalid/non-discrete values remain unassociated with deterministic diagnostics.
- [ ] Reported squawk remains the supplied update; assigned beacon remains plan data.
- [ ] List construction and rendering are association-read-only.
- [ ] Tests cover unique, zero, ambiguous, invalid, `1200`, and unrelated-target cases.
- [ ] Backlog documents every missing future squawk update source found.

## Test plan

- `npm run ci`; focused event/correlation tests.

## Suggested files

- `src/core/flightPlan.ts`, `src/core/world.ts`, `src/scope/systemLists.ts`, spawn/surveillance/replay callers, backlog
