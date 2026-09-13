# T02-144 Abbreviated and pending flight-plan creation

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-143
**Blocks:** T02-145, T02-146
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement keyboard-first abbreviated and pending flight-plan creation and show
the result in the existing Flight Plan list.

## Context

TI 6191.409 Rev. 30 §5.5.1 and §5.5.7 describe ACID-first abbreviated plans
and `INIT CNTL` pending plans with a discrete beacon. Current FL/TAB is a
projection only; `*F` is reserved for altitude filters and must remain so.

## Research

- Supplied `full_manual.pdf`, §5.5.1, pp. 5-85–5-89: abbreviated fields and
  defaults.
- Supplied `full_manual.pdf`, §5.5.7, pp. 5-116–5-119: pending discrete plan
  creation and automatic activation on unique squawk.
- R07: `INIT CNTL` and Preview Area feel; trainer delta is scope-only and not
  Command IR.

## Scope

- Parse ACID-first creation with optional beacon, TCP, type/airport,
  scratchpads, aircraft data, requested altitude, and flight rules.
- Parse pending discrete creation through the scope Preview Area.
- Insert plans into FL/TAB with stable list indices.
- Render creation errors: `FORMAT`, `DUP ID`, `DUP BCN`, `CAPACITY — FP`, and
  `CAPACITY — BCN`.
- Keep `*F` as filter readout and do not add an HTML prompt.

## Out of scope

- Active target association, automatic correlation, modification, deletion,
  VFR/ARTCC messaging, or Unsupported Data Blocks.
- Radio clearances, readbacks, pilot execution, or kinematic changes.

## Acceptance criteria

- [ ] **AC1 —** `ACID [fields] Enter` creates a pending plan.
- [ ] **AC2 —** `INIT CNTL ACID BEACON [fields] Enter` creates a pending
  discrete plan.
- [ ] **AC3 —** Optional fields are order-independent where the manual allows
  them, with explicit ambiguity errors.
- [ ] **AC4 —** Created plans appear in FL/TAB without mutating aircraft.
- [ ] **AC5 —** Parser and integration tests prove `*F` remains altitude
  filter behavior and no Command IR is emitted.

## Test plan

- Unit: preview creation grammar and field validation.
- Integration: `src/scope/test/flightPlanLifecycle.integration.test.ts`.
- Manual: keyboard Preview Area walk against supplied manual.

## Suggested files

- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/systemLists.ts`
- `src/scope/test/flightPlanCreation.test.ts`

