# T02-176 Radio squawk command

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-175  
**Blocks:** T02-178, T02-180  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Add text/spoken, radio-only squawk assignment without collapsing assigned-plan
beacon into independently reported surveillance code.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `DAL123 SQ 4721` | assign/read back 4721 | aircraft assigned code now; reported code only after pilot delay; plan beacon unchanged | `1289`, `472`, `47210` -> `unable squawk` | JO 7110.65BB §5-2-1 |
| `DAL123 SQ VFR` | assign 1200 | same delayed path; never IFR-correlate | no plan activation | §5-2-7 |
| spoken `squawk four seven two one` | same IR | source parity | malformed -> current parse reject | §2-4-17 |
| `I` / `squawk ident` | existing IDENT | no code write | never an assignment | §5-3-3 |

## Scope

- Add `ASSIGN_SQUAWK { code; source: "DISCRETE" | "VFR" }` to IR, parser,
  validator, application, readback, events, and exhaustive tests.
- Typed grammar: optional ACID then `SQ <[0-7]{4}>` or `SQ VFR`; spoken accepts
  `squawk` plus four separate digits or `VFR`; preserve leading zeroes.
- One aircraft-scoped acknowledgement path writes assigned state, then uses the
  existing reported-squawk update hook. `1200` remains non-correlatable.
- Add Help and `docs/USER.md` rows. Cite R01/R03 and record trainer delta.

## Non-goals

Standby/normal/altitude/off, emergency, allocation, handoff restrictions,
Preview filters, and VFR-to-IFR pickup.

## Acceptance criteria

- [x] Text/voice produce identical IR; only exact octal or VFR parses.
- [x] Rejects are atomic; no synchronous reported-code write.
- [x] Existing IDENT/direct/F6/F9/scope-B/correlation behavior remains green.

Implementation note: the aircraft's assigned transponder code is written
immediately, while the existing `updateAircraftSquawk` surveillance hook runs
after a 1,000 ms simulated pilot-report delay. Radio assignment never writes
`FlightPlan.assignedBeacon`; that plan field remains a manual flight-plan edit.
The supplied STARS manual confirms assigned and reported beacon codes remain
distinct in a mismatch (§2.12, p. 2-60; Appendix A-5); the exact `SQ` syntax
and delayed response are trainer deltas.

## Test plan

- Unit: parse/source parity/leading-zero/malformed/exhaustive schema.
- Integration: assignment -> delayed report -> unique/ambiguous/1200 correlation.
- Manual: JO §5-2-1, §5-2-7, §5-3-3.

## Suggested files

`src/core/command/types.ts`, `src/parse/*`, `src/parse/spoken/*`,
`src/pilot/*`, `src/core/flightPlan.ts`, focused tests, `docs/USER.md`.
