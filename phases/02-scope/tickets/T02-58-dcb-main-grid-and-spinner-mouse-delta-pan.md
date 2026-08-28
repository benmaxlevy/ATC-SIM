# T02-58 DCB MAIN Grid Re-alignment & Spinner Mouse-Delta Panning

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-54
**Blocks:** T02-59, T02-60
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Re-align the MAIN DCB button layout to Vice / STARS 19-column standards (standard `RANGE`, `PLACE CNTR`/`OFF CNTR`, `RR`, `PLACE RR`/`RR CNTR`, `MAPS`, Quick Maps, `WX`, `BRITE`, `LDR DIR`/`LDR`, `CHAR SIZE`, `MODE FSL`, `SITE`, `PREF`, `SSA FILTER`/`GI TEXT FILTER`, `SHIFT`), and upgrade DCB spinner interaction physics: continuous vertical mouse-drag delta capture, direct typed numeric entry with Enter commit, and continuous PPI mouse-drag panning for `PLACE CNTR` and `PLACE RR`.

## Context

In Vice and FAA STARS hardware, the MAIN DCB follows a strict 19-column grid layout with half-vertical and full buttons. Spinners capture mouse vertical movement for rapid stepping, accept typed numbers directly, and `PLACE CNTR` allows dragging the radar center smoothly rather than requiring single-click approximations.

## Research

- **Analog:** CRC STARS DCB / Vice `stars/dcb.go` (`drawDCB`, `drawDCBSpinner`, `drawDCBMouseDeltaButton`, `dcbRadarRangeSpinner`, `makeLeaderLineDirectionSpinner`).
- **Glossary:** Display Control Bar (DCB), Mouse Delta Panning, Quick Maps, Radar Site Mode.
- **Trainer delta:** Replaces custom altitude `FILTER` button on MAIN with standard STARS `RR` / `PLACE RR` / `RR CNTR` positioning (altitude filter is typed via `[MULTIFUNC]F...` on the keyboard/preview area).

## Scope

- **Re-align MAIN DCB Columns (19 columns / 22 slots)**:
  1. `RANGE` (Full Spinner: 6 to 256 NM).
  2. `PLACE CNTR` (Half-V Top: mouse-delta pan) / `OFF CNTR` (Half-V Bottom: toggle).
  3. `RR` (Full Spinner: 2, 5, 10, 20 NM).
  4. `PLACE RR` (Half-V Top: place center) / `RR CNTR` (Half-V Bottom: toggle centered).
  5. `MAPS` (Full Menu Button).
  6–8. **6 Quick Map Slots** (2 rows $\times$ 3 columns: `<ID>\n<LABEL>`).
  9–11. `WX1` to `WX6` (2 rows $\times$ 3 columns: Half-Horizontal with green `AVL` badge when weather data present).
  12. `BRITE` (Full Menu Button).
  13. `LDR DIR` (Half-V Top: Spinner 1–9) / `LDR` (Half-V Bottom: Length Spinner 0–7).
  14. `CHAR SIZE` (Full Menu Button).
  15. `MODE FSL` (Full Unsupported/Disabled).
  16. `SITE` (Full Button showing e.g. `SITE\nPHL` or `SITE\nNXX`, opening SITE submenu).
  17. `PREF` (Full Button showing active profile name, e.g. `PREF\nFINAL`).
  18. `SSA FILTER` (Half-V Top) / `GI TEXT FILTER` (Half-V Bottom).
  19. `SHIFT` (Full Button to swap to AUX DCB).
- **Spinner Physics Upgrade**:
  - Direct Mouse Wheel: Steps value immediately on wheel over spinner without opening menus.
  - Mouse Click & Drag: Captures vertical mouse delta while mouse button is held, stepping value smoothly.
  - Direct Typed Entry: When a spinner is active, typing numeric digits (e.g. `40`) and pressing `Enter` sets the value directly; `Escape` cancels.
- **Continuous PPI Panning**:
  - `PLACE CNTR`: Clicking and dragging on PPI smoothly translates the view center lat/lon coordinates.
  - `PLACE RR`: Dragging or clicking places the custom range ring center.

## Out of scope

- AUX DCB and submenus overhaul (owned by T02-59).
- Scroll physics and scale-to-fit (owned by T02-60).

## Implementation notes

- Update `DisplayControlBar.tsx`, `src/scope/dcbMenu.ts`, and `src/scope/dcbFunctions.ts`.
- Ensure keyboard focus and event handling pass through to active DCB spinners when in spinner mode.

## Acceptance criteria

- [ ] **AC1 —** MAIN DCB renders the authentic 19-column layout matching Vice / STARS standard.
- [ ] **AC2 —** `PLACE CNTR` supports continuous click-drag PPI panning of center lat/lon coordinates.
- [ ] **AC3 —** Spinners step on mouse wheel, capture vertical mouse drag, and accept typed numbers + Enter.
- [ ] **AC4 —** Quick video maps toggle properly; `SITE` button displays active radar site and opens site menu.
- [ ] **AC5 —** Automated tests cover button layouts, spinner physics, and mouse-delta panning calculations.

## Test plan

- Unit: `src/ui/DisplayControlBar.test.ts` (grid layout, click handlers, spinner actions).
- Integration: `src/scope/dcbFunctions.test.ts` (mouse-delta pan math, typed range entry).

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/dcbMenu.ts`
- `src/scope/dcbFunctions.ts`
- `src/ui/DisplayControlBar.test.ts`
