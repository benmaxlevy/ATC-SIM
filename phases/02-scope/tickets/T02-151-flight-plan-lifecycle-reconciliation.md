# T02-151 Flight-plan lifecycle reconciliation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-150  
**Blocks:** T02-152  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Keep creation, activation, termination, deletion, and beacon release coherent with canonical association and event-driven squawk correlation.

## Research

- Supplied `full_manual.pdf`, §5.5, pp. 5-84–5-141: creation and pending states.
- Supplied `full_manual.pdf`, §5.6.15, p. 5-164: release beacon semantics.
- Supplied `full_manual.pdf`, §5.6.17, pp. 5-167–5-173: explicit one-field plan modification.

## Scope

- Audit all lifecycle paths for the one-way association invariant.
- Terminating or deleting a plan clears canonical association and leaves no shadow callsign/plan projection on the target.
- Releasing/changing a plan beacon never silently associates a target; only a later aircraft squawk update may trigger correlation.
- Keep pending/scheduled plans listed until explicit activation/association state changes.
- Preserve explicit ACID/beacon/list-line association and invalid-input behavior.

## Out of scope

- Pilot execution, route flying, voice phraseology, and new command grammar except fixes required by lifecycle behavior.

## Acceptance criteria

- [ ] Terminate-control and F4 alias share one helper and produce the same unassociated result.
- [ ] Deleting a plan cannot leave callsign or plan fields through a shadow association.
- [ ] Plan beacon edits/releases do not mutate reported squawk or cause background association.
- [ ] Pending plans remain correctly listed without list-construction mutation.
- [ ] Tests cover create → pending → squawk update → associate → terminate, release, delete, and repeated termination.

## Test plan

- `npm run ci`; focused lifecycle integration and command alias tests.

## Suggested files

- `src/core/flightPlan.ts`, `src/scope/scopeKeys.ts`, `src/scope/previewArea.ts`, `src/scope/systemLists.ts`
