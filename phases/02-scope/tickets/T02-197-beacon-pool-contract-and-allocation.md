# T02-197 Beacon-pool contract and allocation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** none  
**Blocks:** T02-198  
**Merge target:** `feature/beacon-pools`  
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Mission

Replace the six one-code beacon placeholders with one generic, validated
trainer pool contract and allocator. Preserve assigned plan beacon data as
separate from aircraft-reported squawk data. This is STARS-like trainer
behavior, not an official NAS beacon bank.

## Manual research

Authoritative sources:

- `/home/ben/Documents/stars refs/full_manual.pdf`:
  - §5.5.1, pp. 5-85–5-89, Table 5-3: abbreviated creation and beacon
    selectors.
  - §5.5.5, pp. 5-105–5-110, Table 5-7: `+`, `/`, `/1`–`/4`, `A`, omitted
    beacon behavior, duplicate/capacity errors.
  - §5.6.15, p. 5-164: release assigned beacon behavior.
- `/home/ben/Documents/stars refs/quick_reference_manual.pdf`, p. 18:
  creation entry forms and supported beacon selectors.

The manuals define pool selection and error behavior, but do not publish
trainer pool contents or require random selection. ATC-SIM keeps deterministic
first-free allocation as an explicit trainer delta.

## Contract

Pool keys are `ifr`, `vfr`, `general1`, `general2`, `general3`, and `general4`.
Each pool contains validated four-digit octal codes. A configuration also has a
default policy of one pool key or `none`. Missing configuration means `none`;
no operational/NAS values are invented by the core.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Allocate from configured IFR pool | Return first free code in configured order | Caller assigns plan `assignedBeacon` | Empty/exhausted pool returns no code to caller | §5.5.5, Table 5-7, p. 5-108 |
| Allocate from configured VFR/general pool | Same for selected pool | No aircraft squawk mutation | Unknown pool key is a typed configuration error | Table 5-7, p. 5-108 |
| Pool entry `4215` | Accept four octal digits | Code can be assigned | `1289`, `421`, `42150` rejected | §§5.5.1/5.5.5 |
| Duplicate occupied code | Skip it and choose next free code | Existing plan/aircraft state unchanged | No free code → `CAPACITY — BCN` at command boundary | §5.5.5 response, p. 5-107 |
| Released assigned code | Code is available to later allocation | Release never changes reported squawk | Invalid lifecycle remains rejected | §5.6.15, p. 5-164 |
| Same pool and occupied set repeated | Same result | Deterministic trainer behavior | No random requirement is added | Manual is silent; T02-143 policy |

## Scope

- Add a generic pool/configuration type at the core/scenario boundary without
  facility-specific branches.
- Add one shared allocator and one normalized occupancy helper.
- Validate pool entries, duplicate pool definitions, and default references at
  load/configuration boundaries.
- Preserve explicit-code validation and `DUP BCN` plan validation.
- Reserve assigned codes from non-deleted flight plans and current aircraft
  assigned squawk values; keep reported squawk provenance separate.
- Keep `allocateBeaconCode` deterministic and reusable by all callers.

## Allowed and forbidden effects

Allowed: create a plan-side assigned beacon from a configured pool.  Forbidden:
rewriting `Aircraft.squawk`, `reportedSquawk`, `assignedSquawk`, ACID, intent,
kinematics, association, or Command IR state.

## Tests

- Synthetic core unit tests for pool validation, deterministic order, occupied
  codes, exhaustion, deleted plans, and release/reuse.
- Synthetic config tests for missing default (`none`), valid default, invalid
  pool code, duplicate code, and unknown default reference.
- Regression tests for explicit `+`, `/`, `/1`–`/4`, four-octal codes, `A`,
  `DUP BCN`, and `CAPACITY — BCN`.
- No production map counts, IDs, or facility geometry in generic tests.

## Help/docs

No user syntax changes are owned here. Update core comments and exported type
documentation to call these beacon pools, not an official beacon bank.

## Manual-review checklist

- [x] Table 5-3 and Table 5-7 selector meanings remain exact.
- [x] Omitted/default behavior is not described as random by implementation or
  help.
- [x] `A` remains no assigned code and is not an allocator selector.
- [x] `CAPACITY — BCN`, `DUP BCN`, and malformed-code behavior are preserved.
- [x] Assigned plan beacon and reported aircraft squawk remain distinct.

## Non-goals

- Official NAS/STARS pool contents or host allocation.
- Random allocation requirement.
- Radio `SQ`, Command IR, pilot execution, association, or aircraft behavior.
- Pool exhaustion telemetry, multi-controller ownership, or new DCB controls.

## Suggested files

- `src/core/flightPlan.ts`
- `src/core/world.ts`
- `src/scenario/types.ts`
- `src/scenario/load.ts`
- `src/core/index.ts`
- `src/core/test/flightPlan.test.ts`
- `src/core/test/filedRoute.test.ts`

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
tests, `npm run ci`, and manual-review notes. No merge or push by worker.
