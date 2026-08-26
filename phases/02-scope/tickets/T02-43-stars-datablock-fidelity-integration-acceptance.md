# T02-43 STARS datablock fidelity integration and acceptance

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-39, T02-40, T02-41, T02-42
**Blocks:** Phase 05
**Launch:** Implement this ticket only.

## Goal

Comprehensive integration, visual fidelity, and regression acceptance test suite validating the entire STARS CRC Datablock & Scratchpad fidelity overhaul across simulation runtime, radio clearances, and scope rendering:
- Dual scratchpad state (`sp1`, `sp2`) automatically derived from voice/text clearances:
  - Approach clearances (e.g. `"expect ils runway 27"`, `"cleared ils runway 27"`) -> `I27` in SP1.
  - RNAV / Visual approach clearances -> `R22L`, `V28` in SP1.
  - Interim altitude clearances (`"climb and maintain 4000"`) -> `040` in SP1 when no approach is set.
  - Speed clearances (`"reduce speed to 210 knots"`) -> `S21` in SP2.
- FDB / PDB ground speed tens formatting (`18`, `25`) and wake/RNAV category indicators (`18H`, `25R`).
- Multi-phase Line 2 time-sharing (cycling left Mode C / SP1 / SP2 and right GS / Type / Requested Alt, plus center handoff ID).
- Safety inhibit glyphs (`*`, `▲`) and SPC codes (`EM`, `RF`, `HJ`, `MI`, `LL`, `OD`, `ME`, `MF`, `LN`) on Line 1.
- Zero regressions across existing radar tracking, DCB menus, FMS navigation, and voice telephony check-ins.

## Context

This is the capstone integration ticket for the Eleventh Swarm (T02-39–43). It ties together scratchpad derivation from radio clearances, tens-based ground speed with category suffixes, multi-phase time-sharing, and safety alert inhibits, ensuring that the ATC-SIM scope faithfully replicates FAA STARS CRC datablock behavior under real operating conditions.

## Research

Read **docs.virtualnas.net/crc/stars** (Complete Datablock & Scratchpad Specifications).
- Review all acceptance criteria across T02-39, T02-40, T02-41, and T02-42.
- Verify full test suite execution: `npm test`, `npm run build`, and `npm run ci`.

## Scope

- Create comprehensive end-to-end integration test file `src/scope/datablockFidelity.integration.test.ts` verifying:
  1. **Radio Clearance to Scratchpad Derivation**:
     - Issuing `"expect ils runway 27"` or `"cleared ils runway 27"` updates aircraft intent and derives `I27` in SP1.
     - Issuing `"descend and maintain 3000"` when no approach is assigned derives `030` in SP1.
     - Issuing `"maintain 210 knots"` derives `S21` in SP2.
  2. **Tens-based Ground Speed & Category**:
     - Verify ground speed displays as 2-digit tens with wake/RNAV suffix (e.g. `21H`, `18R`).
     - Verify PDB speed suppression option when enabled.
  3. **Multi-Phase Time-Sharing Cycle**:
     - Verify Line 2 rotates left field (Mode C -> SP1 -> SP2) and right field (GS -> Type -> Req Alt) smoothly as simulation time advances.
     - Verify empty fields are skipped seamlessly without empty display ticks.
     - Verify center handoff sector indicator appears during active handoff transfers.
  4. **Safety Inhibit Glyphs & SPCs**:
     - Verify `*` appears for MSAW inhibit and `▲` appears for CA inhibit.
     - Verify squawk 7700 sets `EM`, 7600 sets `RF`, 7500 sets `HJ`, etc.
  5. **Scope Rendering & Canvas Output**:
     - Verify that `renderScope` accurately renders all datablock lines and colors across FDB, PDB, and LDB modes.
- Verify that 100% of all unit, integration, and CI tests pass with zero regressions.
- Update documentation in `phases/02-scope/README.md` and `phases/SWARM-STATUS.md` reflecting the completion of the Eleventh Swarm.

## Out of scope

- Multi-controller live networking.
- Phase 05 scoring and evaluation algorithms.

## Implementation notes

- Create `src/scope/datablockFidelity.integration.test.ts`.
- Update `phases/02-scope/README.md`, `phases/SWARM-STATUS.md`.

## Acceptance criteria

- [ ] **AC1 —** Radio voice/text clearances for approaches, altitudes, and speeds automatically update `TrackDisplay` scratchpads (`SP1`/`SP2`).
- [ ] **AC2 —** FDB and PDB datablocks correctly render tens-based ground speed with wake/RNAV category indicators.
- [ ] **AC3 —** Multi-phase time-sharing operates smoothly across simulation time for both FDB and PDB modes, including center handoff sector ID.
- [ ] **AC4 —** Line 1 safety inhibit glyphs (`*`, `▲`) and SPC codes (`EM`, `RF`, `HJ`, `MI`, `LL`, `OD`, `ME`, `MF`, `LN`) display properly.
- [ ] **AC5 —** Zero regressions: all test suites (`npm test`, `npm run build`, `npm run ci`) pass cleanly (100% green).
- [ ] **AC6 —** Scope documentation in `phases/02-scope/README.md` is updated to detail the complete STARS CRC datablock fidelity model.

## Test plan

- Full automated test suite run: `npm test`.
- Full project verification: `npm run ci`.
- Targeted integration test execution: `npm test src/scope/datablockFidelity.integration.test.ts`.

## Suggested files

- `src/scope/datablockFidelity.integration.test.ts`
- `src/scope/datablock.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
- `phases/02-scope/README.md`
