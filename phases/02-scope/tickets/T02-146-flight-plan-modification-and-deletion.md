# T02-146 Flight-plan modification and deletion

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T02-145
**Blocks:** T02-147
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement manual flight-plan field modification and `TERM CNTL` deletion for
local plans and associated tracks.

## Context

TI 6191.409 Rev. 30 §5.6.17 permits identity or slew-based modification of
one plan field. §5.4.6 uses `TERM CNTL` to delete a plan or associated data
block. Active/inactive field restrictions and ownership errors matter.

## Research

- Supplied `full_manual.pdf`, §5.6.17, pp. 5-167–5-173: modify grammar,
  valid fields, identity, and errors.
- Supplied `full_manual.pdf`, §5.4.6, pp. 5-79–5-80: delete behavior.
- R07: Preview Area identity/slew feel; trainer delta is local-only.

## Scope

- Add `MULTI FUNC M` identity-then-field and field-then-slew workflows.
- Modify ACID, assigned beacon, TCP, fixes/type, scratchpads, altitudes, and
  inactive ETA/PTD where valid.
- Add `TERM CNTL` identity and target-slew deletion.
- Enforce `NO FLIGHT`, `DUP BCN`, `DUP ID`, `ILL TRK`, and `FORMAT` results.
- Delete association cleanly while preserving aircraft kinematics.

## Out of scope

- ASA, In-Out-In, interfacility ownership, command override privileges,
  VFR/ARTCC messages, TSAS, and Unsupported Data Blocks.
- Radio clearance amendment or pilot execution.

## Acceptance criteria

- [ ] **AC1 —** Each supported field modifies the authoritative plan and
  updates FL/FDB projections.
- [ ] **AC2 —** Active/inactive restrictions match the manual’s supported
  subset.
- [ ] **AC3 —** Deleting an associated plan leaves an unassociated track and
  does not alter intent or position.
- [ ] **AC4 —** Duplicate and ownership errors are explicit, never silent.
- [ ] **AC5 —** Tests cover identity, slew, modification, deletion, and
  invalid transitions.

## Test plan

- Unit: command grammar and plan mutation rules.
- Integration: create → associate → modify → delete.
- Manual: Preview Area command walk against supplied manual.

## Suggested files

- `src/core/flightPlan.ts`
- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/ppi.ts`
- `src/scope/systemLists.ts`
- `src/scope/test/flightPlanLifecycle.integration.test.ts`

