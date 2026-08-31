# T02-77 Radar Sites Integration and Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-76, T04-44, T04-45
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Connect authored radar sites through scenario loading, SITE controls, SSA, and sampled rendering. Prove FUSED, airport single-site, and MULTI behavior end to end with generic automated tests and documented manual limits.

## Context

T04-44 supplies SID transition amend; T04-45 supplies RadarSite schema. T02-75 supplies sampled display behavior; T02-76 supplies operator controls and SSA mode text. This ticket closes the integration gap without embedding airport-specific runtime branches.

T02-68–72 are reserved for the WX mosaic swarm. This ticket is T02-77.

## Research

- **R07 — CRC / vNAS STARS client:** https://docs.virtualnas.net/crc/stars/; Search: `vNAS CRC STARS SITE FUSED radar display`. Use for SITE/DCB and scope interaction analogs.
- **R05 — FOA Handbook, STARS chapter:** https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html; Search: `FAA FOA STARS radar display data MSAW`. Use for facility and display-data terminology.
- **R01 — FAA JO 7110.65:** https://www.faa.gov/air_traffic/publications/atpubs/atc_html/; Search: `FAA JO 7110.65 radar identification display`. Use for radar operational wording and acceptance expectations.
- **Trainer delta:** Authored sites are fixture data, not hard-coded facility behavior. This trainer has no live sensor health, no 30-second coast, no aural ATPA. WX mosaic is a separate swarm.

## Scope

- Load authored radar sites for KDEM and KATL through existing scenario/catalog integration.
- Verify FUSED → airport single-site changes report period, coverage, and paint behavior.
- Verify MULTI chooses nearest covering site and paints the frozen blue rectangle.
- Verify single-site paint uses green slash toward selected antenna.
- Verify SSA and MAIN SITE text stay synchronized through mode changes.
- Update `phases/LATER-IMPLEMENTATION-BACKLOG.md`:
  - PREF named sets shipped.
  - Per-track PTL shipped.
  - SSA/SITE chrome live for authored sites.
  - Still no live sensor health, 30-second coast, aural ATPA. Do not steal the WX mosaic backlog (T02-68–72).
- Update phase 2 README ticket table if it lists addenda.
- Keep automated tests generic with synthetic sites; do not encode KATL production map counts or geometry.
- Run `npm run ci` and require green result.
- Record manual Chrome SITE walk as skipped with reason when no visual operator is available; do not invent a visual pass.

## Out of scope

- New RadarSite schema fields or loader architecture (T04-45).
- New SID FMS (T04-44 is transition amend only).
- New sampling or DCB behavior outside fixes required for integration.
- Live sensor health or network telemetry.
- 30-second coast, aural ATPA, WX mosaic, or paid speech/radar vendors.
- KATL-specific `if (icao === "KATL")` or equivalent live-path branching.

## Implementation notes

- Use loaded site IDs and schema data for all mode routing, periods, coverage, and antenna vectors.
- Keep KDEM/KATL references in fixtures or acceptance data only; generic tests use minimal synthetic sites.
- Test mode transition through the same public path an operator uses, then assert sampler state, coverage, target paint, MAIN label, and SSA radar word.
- Ensure persisted SITE mode invalidated by a scenario with no matching site falls back to FUSED.
- Search live paths for facility-ID conditionals and paid vendor imports before completion; remove any introduced violations.
- Add concise comments where integration crosses R07/R05 analogs and trainer deltas.

## Acceptance criteria

- [ ] **AC1 —** KDEM and KATL authored scenarios load radar sites through generic catalog/scenario integration without facility-ID runtime branches.
- [ ] **AC2 —** FUSED → airport site changes sampling period, coverage suppression, and surveillance mark as specified by T02-75.
- [ ] **AC3 —** MULTI selects nearest covering site and paints a thick blue rectangle perpendicular to PTL.
- [ ] **AC4 —** Single-site mode paints a thin green slash aimed at selected site antenna and no blue block.
- [ ] **AC5 —** MAIN SITE cap and SSA radar word reflect every mode transition; `OK/OK/NA` remains the network stub.
- [ ] **AC6 —** Generic synthetic-site tests prove integration without production map counts, IDs, or geometry assertions.
- [ ] **AC7 —** Backlog documents shipped PREF named sets, per-track PTL, live authored-site SITE/SSA chrome, and remaining health/coast/aural ATPA gaps. WX stays the other swarm.
- [ ] **AC8 —** Any phase 2 README ticket-table addenda are updated.
- [ ] **AC9 —** `npm run ci` passes; no paid vendor integration or facility-ID live-path branch exists.
- [ ] **AC10 — Manual:** Chrome SITE walk is recorded as passed only with visual operator evidence; otherwise recorded as skipped with reason.
- [ ] **AC11 — Research:** Integration comments and user-facing terminology cite relevant R01/R05/R07 analogs and trainer deltas.

## Test plan

- **Unit:** Synthetic-site loader, mode transition, sampler, paint geometry, SSA, and PREF fallback tests.
- **Integration:** KDEM/KATL scenario load smoke tests and ScopeView/DCB/SSA end-to-end tests.
- **CI:** `npm run ci`.
- **Manual:** Chrome SITE walk; if no visual operator is available, record skipped-with-reason and do not claim a visual pass.

## Suggested files

- `src/scenario/`
- `src/scope/surveillance.ts`
- `src/scope/scopeView.ts`
- `src/scope/ssa.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/scope/*.test.ts`
- `src/ui/*.test.tsx`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
- `phases/02-scope/README.md`
