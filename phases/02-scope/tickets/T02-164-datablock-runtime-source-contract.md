# T02-164 Datablock runtime source contract

**Phase:** 02 Scope — datablock source unification  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-147  
**Blocks:** T02-165  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Define one complete, typed runtime projection for one target's datablock.
Centralize plan, aircraft, TrackDisplay, handoff, ATPA, alert, and supported
display-state derivation without changing datablock semantics.

## Research

- Supplied `/home/ben/Documents/stars refs/full_manual.pdf`, §2.12,
  pp. 2-58–2-70: associated/unassociated datablock behavior and Fields 0–8.
- Supplied manual §5.4.1, pp. 5-66–5-67: selected-track association.
- R02 / R05 / R07: official datablock terminology, Mode C, and STARS-like
  FDB/PDB/LDB display concepts.
- Trainer delta: this adapter exposes only modeled trainer state; it does not
  claim NAS host completeness or invent unsupported field values.

## Scope

- Define `DatablockRuntimeState` or an equivalent typed contract.
- Make one builder gather the existing plan-side association, aircraft
  surveillance data, TrackDisplay state, handoff/TCP, ATPA readout, alert
  tags, scratchpads, datablock mode, and supported Field 0–8 inputs.
- Preserve assigned-versus-reported beacon separation.
- Preserve the existing formatter and Field 0–8 priority rules.
- Keep source derivation pure: no World, aircraft, intent, kinematics, or
  Command IR mutation.
- Keep unsupported values explicitly absent rather than inferred.

## Non-goals

- New datablock fields, alerts, TSAS scheduling, CSMM, or duplicate-beacon
  world detection.
- New flight-plan schema, route flying, pilot execution, radio, speech,
  networking, geometry/layout changes, or DCB changes.
- Parsing formatted datablock strings to recover source state.

## Acceptance criteria

- [ ] One builder returns all supported runtime inputs needed by FDB/PDB/LDB
      formatting for a target.
- [ ] Associated FDB ACID and plan-owned values come from the authoritative
      plan association; unassociated targets do not inherit them.
- [ ] Reported and assigned beacon values remain distinct through the adapter.
- [ ] Scratchpad, handoff, ATPA, alert, query, and datablock-mode derivation
      each have one source of truth.
- [ ] Existing `linesForDatablock()` output remains unchanged for equivalent
      inputs.
- [ ] Synthetic tests cover associated, unassociated, pending, suspended,
      beacon-mismatch, handoff, queried-LDB, and empty/unsupported states.
- [ ] Datablock regression suite passes before handoff.

## Tests

- Unit: adapter projection and precedence tests with minimal synthetic
  World/ScopeView/aircraft fixtures.
- Regression: existing datablock, flight-plan lifecycle, handoff, and pick
  tests.
- Gate: focused datablock tests plus `npm run ci`.
- Manual: compare representative FDB/PDB/LDB output with supplied manual
  §2.12 examples; record any trainer delta.

## Files

- `src/scope/datablock.ts` or new `src/scope/datablockRuntime.ts`
- `src/scope/render/renderScopePaint.ts` only if required to expose the
  contract without consumer migration
- `src/scope/test/datablock.test.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`

## Handoff

Worker returns `READY TO MERGE` only after focused datablock regression tests,
`npm run ci`, and manual review or an explicit manual-review skip reason pass.
