# T02-60 DCB Scale-to-Fit, Scroll Physics & Full UI Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-55, T02-56, T02-57, T02-58, T02-59
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the DCB `Scale to Fit` dynamic scaling mode vs fixed 72px buttons with horizontal scroll indicator arrows and notch physics, and provide comprehensive end-to-end integration and visual acceptance tests covering the entire in-scope system lists engine and DCB submenus suite.

## Context

In Vice (`stars/dcb.go` `dcbButtonScale`, `dcbScroll`, `drawDCBScrollIndicators`), the DCB can dynamically scale buttons so the 19–22 slot bar fits the window width without overflowing, or use fixed-size buttons with horizontal mouse-wheel scrolling and left/right green scroll arrow indicators.

## Research

- **Analog:** Vice `stars/dcb.go` (`dcbButtonScale`, `dcbScroll`, `drawDCBScrollIndicators`, `dcbMaxScroll`).
- **Glossary:** Scale to Fit, DCB Scroll Notch, Scroll Indicator Arrows, Acceptance Suite.
- **Trainer delta:** Supports both responsive viewport scaling and physical fixed-size button layout.

## Scope

- **Scale to Fit & Scroll Physics**:
  - Implement `view.dcbScaleToFit`: when enabled, dynamically calculate per-button pixel width so the maximum slot count fits the available PPI dimension exactly.
  - When `Scale to Fit` is disabled:
    - Fixed 72px buttons with DPI scale factor.
    - Mouse wheel over DCB scrolls toolbar horizontally by 1 button step per notch.
    - Render left (`<`) and right (`>`) scroll indicator arrows when content overflows the viewport.
    - Reset scroll offset on menu/submenu transitions.
- **Comprehensive Integration & Acceptance Test Suite**:
  - Create `src/scope/systemListsAndDcb.integration.test.ts`:
    - Tests all in-scope system lists: SSA with ATIS/GI text, TAB Flight Plan list with unassociated flights, VFR list with squawks, Tower list with sorted distance readouts, Alert list with MSAW/CA, Coordination list with `[F13]` releases, Coast/Suspend list, Video Maps list.
    - Tests list middle-click drag lifecycle, drop repositioning, and green collision frames when lists overlap.
    - Tests DCB MAIN layout, AUX layout, and all 7 submenus (BRITE 16-channel, CHAR SIZE 5-channel, MAPS category filters, PREF 32 slots, SSA 22 filters, GI TEXT, TPA/ATPA).
    - Tests spinner mouse wheel stepping, vertical mouse drag delta, and direct numeric keyboard entry.
    - Verifies zero simulation regressions on kinematics, SIDs/STARs, ILS, and voice telephony.

## Out of scope

- Downstream phase 3/4 radar tools (RBLs, CRDA ghost rendering).

## Implementation notes

- Place new integration test in `src/scope/systemListsAndDcb.integration.test.ts`.
- Ensure all 135+ existing test files continue to pass with 0 regressions.

## Acceptance criteria

- [ ] **AC1 —** DCB `Scale to Fit` mode dynamically sizes buttons to fit the window; fixed mode supports wheel scroll and indicator arrows.
- [ ] **AC2 —** Comprehensive integration test drives complete system lists lifecycle (TAB, VFR, Tower, Alert, Coordination, Maps, Coast).
- [ ] **AC3 —** Integration test drives complete DCB suite (MAIN, AUX, BRITE 16-ch, CHAR SIZE, PREF 32 slots, SSA 22 filters, TPA/ATPA).
- [ ] **AC4 —** Middle-click drag and collision detection operate without canvas artifacts.
- [ ] **AC5 —** Full test suite (`npm test` and `npm run ci`) passes 100% clean with zero regressions.

## Test plan

- Unit: `src/ui/DisplayControlBar.test.ts`, `src/scope/systemLists.test.ts`.
- Integration: `src/scope/systemListsAndDcb.integration.test.ts`.
- Manual: Open app, toggle `Scale to Fit`, verify list dragging and all DCB submenus.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/systemLists.ts`
- `src/scope/systemListsAndDcb.integration.test.ts`
