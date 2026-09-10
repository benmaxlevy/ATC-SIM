# T02-128 ATPA wake acceptance and documentation

**Phase:** 02 Scope — ATPA wake criteria
**Priority:** P0
**Size:** M
**Depends on:** T02-127
**Blocks:** none
**Launch:** Implement this ticket only. Stop after acceptance.

## Goal

Prove the wake-aware ATPA loop end to end and reconcile shipped ATPA
documentation/tests with the new FAA-backed behavior.

## Research

- [FAA JO 7110.65 §5-5-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html): wake matrix, `NOWGT`, and reduced-final conditions.
- [FAA Pilot/Controller Glossary](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-a.html): terminal wake category definitions.
- [CRC STARS ATPA](https://docs.virtualnas.net/crc/stars/): ATPA cone length is the allowable in-trail minimum; CRC display behavior remains a trainer reference only.

## Scope

- Add one focused ATPA wake acceptance/integration test using synthetic tracks
  and catalog data.
- Replace T02-44/T02-50 wake-independence assertions with explicit category,
  matrix, and `NOWGT` assertions.
- Update Phase 2 ATPA addendum and
  `phases/LATER-IMPLEMENTATION-BACKLOG.md` to mark wake minima shipped while
  preserving remaining omissions: per-position adaptation, TDW variant,
  aural ATPA, and authored-volume boundaries.
- Keep manual visual claims separate; automated tests are the gate.

## Out of scope

- New production facility adaptation beyond minimal contract updates.
- ICAO-type category mapping or external FAA cycle ingestion.
- UI redesign, TSAS, networking, or other backlog items.

## Acceptance criteria

- [ ] **AC1 —** Synthetic heavy/light and category-pair fixtures prove matrix lookup and leader/follower orientation.
- [ ] **AC2 —** Missing/blank wake data visibly remains available for later `NOWGT` formatting and uses `10 NM` in world state.
- [ ] **AC3 —** Wake minimum dominates reduced `2.5 NM` radar separation.
- [ ] **AC4 —** KDEM and KATL authored volume rows remain generic and no facility branch is added.
- [ ] **AC5 —** Existing ATPA cone/readout integration consumes `requiredNm` without recalculating separation in scope.
- [ ] **AC6 —** Documentation no longer claims that JO 7110.65 lacks a wake matrix.
- [ ] **AC7 —** Focused ATPA tests and `npm run ci` pass.

## Test plan

- Focused ATPA unit and world integration tests.
- Existing `src/scope/atpaFidelity.integration.test.ts`.
- `npm run ci`.

## Suggested files

- `src/core/alerts/test/atpa.test.ts`
- `src/core/test/world.atpa.test.ts`
- `src/scope/atpaFidelity.integration.test.ts`
- `phases/02-scope/README.md`
- `phases/02-scope/tickets/T02-44-atpa-in-trail-pairing-engine.md`
- `phases/02-scope/tickets/T02-50-tpa-atpa-integration-and-acceptance.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
