# T02-180 IFR clearance parser, application, and documentation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-176, T02-177, T02-178, T02-179  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Compile text/spoken IFR clearances into one atomic plan-plus-aircraft change.
Only clearance limit and one access method are mandatory; all supported other
fields are optional.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `CLR TO KAHN VIA DIRECT` | new direct-to-limit clearance | active route flies now | missing limit/method -> `unable clearance` | JO §4-2-1 |
| `CLR TO KAHN VIA SIITH THEN DIRECT` | route SIITH -> KAHN | one revision/event; fly SIITH | unknown SIITH -> atomic `unable route` | §4-2-1 |
| `CLR TO KAHN ASFILED` | execute current route | active lifecycle | absent route -> `unable route` | §4-3-3 |
| `CLR TO KAHN VIA RADAR VECTORS` | clearance active; vectors pending | no automatic turn | mixed access -> `unable clearance` | §5-6-2 |
| optional `ALT`, `CVIA`, `FREQ`, `SQ` | apply present fields in order | atomic plan/intent/code update | duplicate/order error -> `unable clearance` | §4-2-1/§4-3-2 |

## Research

JO 7110.65BB §4-2-1 (clearance items/order), §4-2-5 (direct amendment),
§4-3-2–3 (SID/as-filed/climb-via), §5-2-1/7 (beacon), and §5-6-2 (vectors);
R01/R03/R08. Compact `CLR` is an explicit trainer text syntax, not NAS.

## Scope

- Add `IFR_CLEARANCE` semantic action and atomic world transaction; never send
  it through tactical `applyIntent` alone.
- Typed grammar: `<ACID> CLR TO <LIMIT> (ASFILED|VIA DIRECT|VIA <FIX> THEN
  DIRECT|VIA RADAR VECTORS|VIA <SID> [<TRANSITION>])`, followed only in order
  by optional `ALT <hundreds>`, `CVIA`, `FREQ <value>`, `SQ <code>`.
- Spoken Path A/B accepts FAA-shaped equivalents and wins before tactical
  `cleared direct` matching. `CLEARED/PROCEED DIRECT` remains T02-179 lateral.
- Resolve limits/routes generically; commit limit, route, lifecycle, optional
  altitude/code, access state, event and readback together or not at all.
- Update Help and `docs/USER.md` exact text/spoken forms and trainer delta.

## Non-goals

VFR-to-IFR pickup/airfile, full amendments, hold/release/void, weather,
ODP/DVA/LOA, nonradar, SVFR/VFR-on-top, CPDLC, and final broad E2E/manual wave.

## Acceptance criteria

- [x] Limit plus exactly one access method is valid; altitude/frequency/beacon/
  SID climb-via remain optional.
- [x] Executable methods fly now; radar vectors wait; tactical direct never
  creates a clearance.
- [x] Text/spoken parity, precedence, incomplete/malformed/duplicate fields,
  atomic rollback, readback, Help, and User docs are covered.
- [x] No pickup/airfile or facility branch ships.

## Test plan

Grammar matrix/access methods/field ordering/parity units; plan/aircraft atomic
integration and route/vector tests; regression CI; manual review §4-2-1,
§4-2-5, §4-3-2–3, §5-2-1/7, §5-6-2.

## Suggested files

`src/core/{command/types,flightPlan,world,aircraft}.ts`, `src/parse/*`,
`src/parse/spoken/*`, `src/pilot/*`, Help, `docs/USER.md`, focused tests.
