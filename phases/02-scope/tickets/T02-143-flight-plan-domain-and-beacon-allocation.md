# T02-143 Flight-plan domain and beacon allocation

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** none
**Blocks:** T02-144, T02-145
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Create an authoritative local flight-plan model separate from aircraft
surveillance state. Add generic validation and deterministic trainer beacon
allocation without changing radio, Command IR, or kinematics.

## Context

Current `World` has no plan collection. `Aircraft.flightPlan`/`fp` and
`ScheduledDeparture` are partial sources, while `systemLists.ts` mutates
aircraft during correlation. The supplied TI 6191.409 Rev. 30 manual, §§5.4–5.6,
requires distinct pending/active plan state, unique ACID/beacon identity, and
assigned versus reported beacon data.

## Research

- Supplied `full_manual.pdf`, §§5.4–5.6, pp. 5-66–5-179: plan states,
  four-digit octal beacon codes, pending/active creation, and error behavior.
- R02 / R05 / R07 in `phases/_shared/references.md`: datablock, Mode C,
  STARS-like scope terminology and trainer boundary.
- Trainer delta: local browser state; no NAS host, FDIO, or official beacon bank.

## Scope

- Add a generic `FlightPlan` runtime type and `World.flightPlans` collection.
- Represent plan status, ACID, assigned/reported beacon, TCP, flight type,
  fixes, route, scratchpads, altitudes, equipment, and source.
- Validate ACID and four-digit octal codes; reject duplicate identities.
- Add deterministic local pool allocation with explicit no-code support.
- Preserve compatibility projections for existing scenario and aircraft fields.

## Out of scope

- Radio squawk commands or pilot execution.
- VFR/ARTCC messages, interfacility networking, TSAS, ASA, In-Out-In, and
  Unsupported Data Blocks.
- Facility-specific branches or official NAS beacon pools.

## Acceptance criteria

- [ ] **AC1 —** Synthetic plans can be pending, active, suspended, or deleted.
- [ ] **AC2 —** Invalid ACID, non-octal code, duplicate ACID, and duplicate
  beacon return typed errors.
- [ ] **AC3 —** Allocation is deterministic for the same plan/pool input.
- [ ] **AC4 —** Reported squawk never overwrites the plan ACID.
- [ ] **AC5 —** Unit tests cover valid codes, invalid codes, duplicates,
  allocation, and plan lifecycle.

## Test plan

- Unit: `src/core/test/flightPlan.test.ts`.
- Integration: none; downstream tickets consume this model.

## Suggested files

- `src/core/flightPlan.ts`
- `src/core/world.ts`
- `src/core/aircraft.ts`
- `src/scenario/types.ts`
- `src/scenario/load.ts`
- `src/core/test/flightPlan.test.ts`

