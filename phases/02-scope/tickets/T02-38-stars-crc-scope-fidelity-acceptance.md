# T02-38 STARS CRC scope visual and interactive fidelity acceptance

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-34, T02-35, T02-36, T02-37
**Blocks:** Phase 05
**Launch:** Implement this ticket only.

## Goal

Comprehensive visual, interactive, and automated acceptance suite ensuring the complete STARS CRC radar display fidelity overhaul meets all requirements without regressions to core simulation, FMS, or radio telephony:
- Target symbol shapes (primary diamond, unassociated asterisk, VFR V, tracked sector letters).
- Datablock modes: LDB (with click ground-speed query), PDB (Line 2 only), and FDB (with dynamic time-sharing and Line 3 assigned altitude).
- Ownership transitions: F3 take track, F4 drop track, inbound/outbound handoff blinking, pointouts, and cyan track highlighting.
- Zero regressions across existing DCB controls, BRITE submenus, procedural arrivals/departures, and telephony check-ins.

## Context

This is the final integration and acceptance gate for the STARS CRC Scope Fidelity Addendum (T02-34–38). It verifies that all visual behaviors documented in [docs.virtualnas.net/crc/stars](https://docs.virtualnas.net/crc/stars/) are accurately reflected on the scope while maintaining 100% CI pass rates.

## Research

Read **docs.virtualnas.net/crc/stars** (Complete CRC STARS reference).
- Review all acceptance criteria across T02-34, T02-35, T02-36, and T02-37.
- Verify that `npm run test` and `npm run ci` pass cleanly.

## Scope

- End-to-end integration test file `src/scope/starsFidelity.integration.test.ts` testing:
  1. Primary-only targets render as diamonds without datablocks.
  2. Unassociated 1200 targets render as `V` with LDB showing squawk and altitude; clicking target queries ground speed.
  3. Associated tracks owned by other positions render as PDB (Line 2 only); clicking toggles to Green FDB.
  4. Inbound handoff spawns as blinking white FDB; clicking accepts track, turning datablock solid white and position symbol to owning sector ID.
  5. FDB Line 2 time-shares between altitude/GS and scratchpad/type.
  6. FDB Line 3 renders assigned altitude `A040` when assigned level differs from Mode C.
  7. Middle-clicking toggles cyan highlight on datablocks.
  8. Pressing F4 drops track, reverting datablock to green and position symbol to asterisk.
- Verify full test suite passes (`npm test`, `npm run build`, `npm run ci`).
- Document updated fidelity behaviors and any remaining out-of-scope items in `phases/02-scope/README.md` and `phases/LATER-IMPLEMENTATION-BACKLOG.md`.

## Out of scope

- Multi-controller networking.
- Phase 5 scoring and evaluation metrics.

## Implementation notes

- Create `src/scope/starsFidelity.integration.test.ts`.
- Update `phases/02-scope/README.md` and `phases/LATER-IMPLEMENTATION-BACKLOG.md` as necessary.

## Acceptance criteria

- [x] **AC1 —** Integration test suite verifies all target symbol shapes (`◇`, `*`, `V`, Sector ID).
- [x] **AC2 —** Integration test suite verifies LDB (squawk + alt + queried GS), PDB (Line 2 only), and FDB (time-sharing + Line 3 `A<alt>`).
- [x] **AC3 —** Integration test suite verifies inbound handoff accept, outbound flash, and F4 drop lifecycle.
- [x] **AC4 —** Middle-click cyan highlight works across LDB, PDB, and FDB modes.
- [x] **AC5 —** Zero regressions: `npm test` and `npm run ci` pass cleanly (100% green).
- [x] **AC6 —** Scope documentation in `phases/02-scope/README.md` accurately describes the updated STARS CRC display standard.

## Test plan

- Automated test run: `npm test` across all test files.
- Full build and lint: `npm run ci` (typecheck, lint, format check, tests).
- Scripted manual check steps for browser operator.

## Suggested files

- `src/scope/starsFidelity.integration.test.ts`
- `phases/02-scope/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
