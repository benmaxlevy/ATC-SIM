# T02-173 Derived flight-plan correlation

**Phase:** 02 Scope  
**Priority:** P0  
**Depends on:** T02-172  
**Blocks:** T02-174, T02-175  
**Merge target:** `feature/nas-flightplan-modal`

## Mission

Make targets and flight plans independent. Replace live lookup through
`associatedAircraftId` with one generic read-only resolver: exactly one
non-deleted plan whose assigned beacon equals a target's non-1200 reported
squawk. Zero or multiple candidates mean no correlation and never mutate state.

| Input/form | Expected action/result | State/side effect | Error/negative case | Manual evidence |
| --- | --- | --- | --- | --- |
| target 4321; one plan 4321 | resolve plan | read-only | — | JO 7110.65BB §5-2-1, §5-3-3 |
| target 4321; zero/two plans | no correlation | read-only | UI `NO FLIGHT`, never guess | discrete-code policy |
| target 1200 | no IFR correlation | read-only | UI `NO FLIGHT` | JO §5-2-9 |
| code edit | later lookup reflects code | plan-only or target-only edit | no cross mutation | JO §5-2-2 |

## Scope

- Add resolver/result type; migrate core, scope, list, datablock, and lifecycle
  read paths away from persistent association.
- Remove normal spawn/modal/list mutation-on-squawk association paths. Delete
  association field only after all consumers migrate.
- Test unique, zero, ambiguous, 1200, and code-change cases with minimal worlds.

## Acceptance criteria

- [ ] Correlation is unique-code-only; never ACID/CID fallback.
- [ ] Assigned beacon and reported squawk remain independent provenance.
- [ ] No radio, Command IR, intent, FMS, or kinematic change.
- [ ] CI/manual pass: supplied manual §2.12, §5.5.5, §5.5.9, §5.6.17, App D.

## Non-goals

Squawk commands, clearances, networking, code allocation, or scenario data.

