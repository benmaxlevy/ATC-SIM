# T02-147 Flight-plan datablock integration and acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-145, T02-146
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Connect authoritative flight-plan state to one generic runtime datablock
adapter and prove the complete local lifecycle.

## Context

The formatter supports Fields 0–8, but live rendering currently assembles
values directly from aircraft and display state. This ticket makes plan data,
reported beacon mismatch, FL/TAB, strips, and FDB projection consistent.

## Research

- Supplied `full_manual.pdf`, §2.12 and §5.6.17, pp. 2-58–2-70 and 5-167–5-173.
- R02 / R05 / R07: datablock fields, Mode C, and STARS-like display grammar.
- Trainer delta: adapter supplies only modeled values; it does not claim NAS
  host completeness.

## Scope

- Add a generic adapter gathering aircraft, plan, association, handoff,
  beacon-mismatch, pointout, ATPA, and existing display state.
- Feed explicit values to the existing formatter; unsupported values stay
  empty.
- Keep assigned versus reported squawk, `CSMM`, and `DB` distinct.
- Add one acceptance flow covering create, pending correlation, manual
  association, edit, mismatch, and delete.

## Out of scope

- TSAS scheduling, CSMM/DB world detection, pilot clearance execution,
  radio squawk commands, speech, or Command IR.
- New datablock fields, new alerts, or facility branches.

## Acceptance criteria

- [ ] **AC1 —** Associated FDB ACID and assigned fields come from the plan.
- [ ] **AC2 —** Reported/assigned beacon mismatch renders without changing the
  assigned plan.
- [ ] **AC3 —** FL/TAB and strip projections agree with plan association state.
- [ ] **AC4 —** Delete clears plan association but leaves aircraft kinematics.
- [ ] **AC5 —** Full lifecycle acceptance passes with synthetic plan/track
  fixtures and `npm run ci`.

## Test plan

- Unit: adapter projections and mismatch precedence.
- Integration: `src/scope/test/flightPlanLifecycle.integration.test.ts`.
- Final: `npm run ci`; manual datablock/Preview Area walk.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/systemLists.ts`
- `src/ui/strips/terminalStripsFromWorld.ts`
- `src/scope/test/flightPlanLifecycle.integration.test.ts`

