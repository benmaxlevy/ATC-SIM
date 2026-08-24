# T02-31 DCB physical two-row layout and MAIN arrangement

**Phase:** 02 Scope (post-exit visual-replica addendum)  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-23, T02-24, T02-26, T02-27, T02-29, T02-30  
**Blocks:** T02-32, T02-33  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

MAIN is a compact physical **two-row DCB grid**, not a one-row ribbon. Its visible controls and ordering match the frozen trainer reference while retaining the display-only behavior implemented by T02-22–30.

## Context

T02-22–30 delivered the DCB menu model and jobs, but the present MAIN projection is a flat row. The target places full-height and half-height physical buttons in a fixed two-row grid. This ticket changes only that projection and completes the missing inert system chrome; it does not reopen DCB behavior.

## Research

Read **R07** DCB / MAIN and the visual-replica brief attached to this addendum.

- Search: `vNAS CRC STARS DCB MAIN RANGE PLACE CNTR RR CNTR`
- **Terms:** **DCB**, **MAIN**, **range**, **range rings**, **video map**, **leader**. Not toolbar or ribbon.
- Comment: CRC-style physical DCB arrangement; trainer keeps its frozen jobs, eight range presets, six authored maps, and inert WX/system controls.

## Scope

- Render MAIN with an explicit two-row CSS Grid (or equivalent testable layout model). The bar has exactly two equal logical rows; physical-button gaps remain visible.
- Full-height cells span both rows: `RANGE`, `RR`, `MAPS`, `WX1`–`WX6`, `BRITE`, `CHAR SIZE`, `MODE FSL`, `PREF 22/27`, `SITE FUSED`, and `SHIFT`.
- Stack half-height cells in one column:
  - `PLACE CNTR` / `OFF CNTR`
  - `PLACE RR` / `RR CNTR`
  - `LDR DIR` / `LDR`
  - `SSA FILTER` / `GI TEXT FILTER`
- Put the six quick video-map toggles in a **3 × 2** matrix: maps 1–3 on top and maps 4–6 below. They occupy three adjacent two-row-grid columns, not six horizontal cells.
- Freeze MAIN visual order, left to right:
  1. `RANGE` with its current preset
  2. `PLACE CNTR` / `OFF CNTR`
  3. `RR` with its current interval
  4. `PLACE RR` / `RR CNTR`
  5. `MAPS`
  6.–8. quick video maps 1–6 as 3 × 2
  9.–14. `WX1`–`WX6`
  15. `BRITE`
  16. `LDR DIR` / `LDR`
  17. `CHAR SIZE`
  18. disabled `MODE FSL`
  19. `PREF 22/27`
  20. disabled `SITE FUSED`
  21. `SSA FILTER` / `GI TEXT FILTER`
  22. `SHIFT`
- Preserve existing handlers and state: RANGE/RR/LDR spinners, center/ring actions, MAPS and PREF openers, quick-map toggles, BRITE/CHAR submenus, SSA/GI filter openers, and SHIFT still work. DCB clicks still never emit Command IR.
- Expand T02-24's disabled WX chrome from WX1–WX4 to **WX1–WX6**. No weather state, draw calls, tiles, or mosaic.
- `MODE FSL` and `SITE FUSED` are visible disabled system-status cells. Their labels are fixed trainer chrome and clicks are no-ops.
- Use a data-driven cell/layout descriptor (`id`, row, column, row span, kind, label/value); do not encode positional behavior by button index. The descriptor must allow a second facility/catalog with six map labels without KDEM-specific branches.

## Out of scope

- AUX/submenu visual rearrangement, new DCB jobs, weather, actual FSL/fusion modes, CRC host/site selection, a 1:1 proprietary STARS clone.
- MAPS 7–30 content, changing the frozen range/RR preset sets, or changing PREF persistence semantics.

## Implementation notes

Keep behavior state in `src/scope`; React/CSS maps a declarative MAIN descriptor to grid placement. A full-height cell uses `grid-row: span 2`; a stacked pair occupies one row each. Do not use a CSS visual `order` workaround that leaves keyboard/DOM order inconsistent with physical order.

## Acceptance criteria

- [ ] **AC1 —** MAIN has exactly two logical rows. Full-height cells span both; each named stacked pair is vertically adjacent in one column.
- [ ] **AC2 —** Quick maps 1–6 render as three columns by two rows and operate on the same map-visibility state as MAPS submenu slots 1–6.
- [ ] **AC3 —** The left-to-right physical column order matches the 22-column sequence in Scope; a DOM/layout test asserts each id's row, column, and span.
- [ ] **AC4 —** WX1–WX6, MODE FSL, and SITE FUSED are visible and disabled; clicks produce no state mutation, weather rendering, or Command IR.
- [ ] **AC5 —** RANGE, RR, center/ring controls, leader controls, MAPS, BRITE, CHAR SIZE, PREF, SSA/GI, and SHIFT retain their existing behavior after placement.
- [ ] **AC6 —** A second six-map catalog uses the same matrix descriptor without a facility-id conditional.
- [ ] **AC7 — Research:** DCB/MAIN terminology appears in UI/comments, with the CRC-style layout and trainer delta documented.

## Test plan

- Unit: MAIN layout descriptor positions/spans; disabled cells; six-map matrix bindings.
- Integration: grid markup and existing DCB reducer routing; `DAL123 H270` still parses and turns.
- Manual: T02-33 visual script.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/ui/DisplayControlBar.test.ts`
- `src/scope/dcbMenu.ts`
- `src/scope/dcbFunctions.ts`
- `src/ui/dcbAddendumAcceptance.test.ts`
