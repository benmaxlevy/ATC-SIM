# T02-177 Maintain VFR command

**Phase:** 02 Scope  
**Priority:** P1  
**Size:** S  
**Depends on:** T02-176  
**Blocks:** T02-180  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Add radio-only `MAINTAIN VFR`; it is a VFR instruction, not IFR clearance,
VFR-on-top, route authorization, or plan activation.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `DAL123 MVFR` | maintain-VFR readback | VFR marker only | unknown ACID -> current reject | AIM §4-4; trainer delta |
| spoken `maintain VFR` | same IR | source parity | VFR-on-top not accepted | JO 7-3-1 excluded |
| `MVFR SQ VFR` | ordered instructions | VFR plus assigned 1200 | no IFR route/plan mutation | §5-2-7 |

## Scope

- Add `MAINTAIN_VFR` IR/grammar/readback and minimal future-pickup marker.
- Exact typed form `MVFR`; exact spoken form `maintain VFR`; radio only.
- Document explicit exclusion of VFR-on-top and every forbidden side effect.

## Non-goals

VFR-on-top, SVFR, airspace authorization, flight following, VFR plan lifecycle,
or VFR-to-IFR pickup.

## Acceptance criteria

- [x] Text/spoken parity and deterministic readback.
- [x] No plan, route, altitude, procedure, correlation, or clearance mutation.
- [x] `VFR ON TOP` never silently maps to this command; docs say not clearance.

## Test plan

Unit parse precedence/combined-order/readback; integration snapshots; manual AIM
terminology review.

## Suggested files

`src/core/{command/types,aircraft}.ts`, `src/parse/*`, `src/pilot/*`, Help,
`docs/USER.md`, focused tests.
