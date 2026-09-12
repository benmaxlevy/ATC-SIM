# T02-155 Current beacon and projection truth

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-154  
**Blocks:** T02-156  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Ensure current reported beacon and canonical plan data remain consistent after later squawk changes or disassociation.

## Scope

- Refresh reported-beacon projection on every squawk update, including associated aircraft.
- Make datablock mismatch/readout formatting prefer current aircraft-reported squawk and keep assigned beacon separate.
- Remove remaining reads of aircraft `flightPlan`/`fp` aliases and resolve through plan-side association.
- Add stale-projection regression tests.

## Research

- Supplied `full_manual.pdf`, §2.12, pp. 2-58–2-70: associated/unassociated datablock data.
- Supplied `full_manual.pdf`, Table 5-16, p. 5-171: assigned beacon is flight-plan data.

## Acceptance criteria

- [ ] A post-association squawk change is visible immediately in beacon/mismatch projections.
- [ ] Association never changes reported squawk or assigned beacon.
- [ ] Clearing association removes all plan-derived identity/destination/scratchpad projections.
- [ ] No production path reads aircraft-side plan aliases as authority.

## Test plan

- `npm run ci`; focused datablock and projection tests.
