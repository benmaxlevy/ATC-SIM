# T02-179 Route execution, direct, and vectors

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-178  
**Blocks:** T02-180  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Execute an IFR-cleared route immediately except radar-vector access. Preserve
`CLEARED DIRECT`/`PROCEED DIRECT` as lateral-only instructions.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| route `SIITH -> KAHN` | navigate SIITH then KAHN | index sequences | invalid never starts | JO §4-2-1 |
| direct remaining-route fix | direct then resume | lateral override only | no route revision | §4-2-5 |
| direct off-route navaid | direct then present heading | route retained | unknown -> `unable fix` | trainer delta |
| radar-vector access | awaits heading/vector | vector-pending | never autonomous turn | §5-6-2 |

## Scope

- Extend direct lateral state with `resumeRoute(index)|presentHeading(heading)`.
- Start active executable clearance routes; radar vectors wait for a later
  existing heading/vector instruction.
- `CLEARED DIRECT <fix>` and `PROCEED DIRECT <fix>` accept any catalog fix or
  navaid and compile identically. On-route means a remaining segment; off-route
  means present heading after target. Preserve plain `DCT` compatibility.

## Non-goals

New clearance parsing, plan replacement, auto-rejoin, procedure restrictions
after vectors, weather deviation, and pickup.

## Acceptance criteria

- [ ] On-route direct resumes after named segment exactly.
- [ ] Off-route direct retains plan route/index/revision; never guesses rejoin.
- [ ] Vector pending never turns/follows route before a later vector.
- [ ] Existing direct/STAR/SID/approach/kinematic suites stay green.

## Test plan

Synthetic route direct/resume/off-route/vector-pending/alias units; pilot/world
integration; manual JO §4-2-5/§5-6-2 review with trainer-delta note.

## Suggested files

`src/core/aircraft.ts`, FMS/world sequencing, `src/pilot/applyIntent.ts`,
`src/parse/*`, pilot/core tests.
