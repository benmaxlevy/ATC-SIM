# T02-152 Flight-plan projections and datablocks

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-151  
**Blocks:** T02-153  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make scope lists, F3/F4, PDB/FDB rendering, and datablock identity consume canonical association without creating hidden relationships.

## Research

- Supplied `full_manual.pdf`, §2.12, pp. 2-58–2-70: PDB/FDB/LDB and associated/unassociated display behavior.
- Supplied `full_manual.pdf`, §5.4.1, pp. 5-66–5-67: association follows an explicit selected-track operation.
- Supplied `full_manual.pdf`, Appendix D, Table D-1, p. D-2: F7 is the MULTI FUNC equivalent.

## Scope

- Replace target-side association reads with the canonical resolver.
- Make FL/TAB/list builders pure projections: no correlation, association, or activation during reads.
- Associated tracks display filed identity/plan fields only through canonical association; unassociated tracks do not inherit a plan callsign.
- Preserve explicit F3/F4 and PDB/FDB behavior while removing stale plan projections after disassociation.

## Out of scope

- New plan fields, route editing, pilot execution, networking, and CA.

## Acceptance criteria

- [ ] List rebuild and scope redraw do not change association state.
- [ ] F3/F4 use canonical association and never revive terminated/deleted plans.
- [ ] Unassociated targets show no plan-derived callsign/scratchpad data.
- [ ] Associated targets show consistent identity and plan data across PPI, FL/TAB, and expanded datablock views.
- [ ] Tests cover stale projections after disassociation and repeated redraw.

## Test plan

- `npm run ci`; focused scope projection/render and lifecycle tests.

## Suggested files

- `src/scope/systemLists.ts`, `src/scope/ppi.ts`, `src/scope/trackDisplay.ts`, `src/scope/previewArea.ts`, `src/scope/scopeKeys.ts`
