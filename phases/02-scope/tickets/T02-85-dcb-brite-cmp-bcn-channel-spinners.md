# T02-85 DCB BRITE CMP and BCN Channel Spinners

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-84
**Blocks:** T02-86
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Enable the previously static/disabled `CMP` (compass rose / range ring tick marks) and `BCN` (beacon target symbol) brightness spinners on the DCB `BRITE` submenu.

## Context

On the STARS DCB `BRITE` submenu (docs.virtualnas.net/crc/stars — R07):
- `CMP` (row 2, column 6): Modulates the brightness of compass rose indicators, compass ticks, and range ring degree tick marks.
- `BCN` (row 1, column 7): Modulates the brightness of secondary radar beacon target symbols (`*`, `□`, `V`, `◇`).

Currently, `CMP` is rendered as static disabled text `"45"` and `BCN` as static disabled text `"55"` in `DisplayControlBarMenus.tsx`, and both are listed in `BRITE_DISABLED_CHANNELS` in `src/scope/palette.ts`.

## Scope

- **`CMP` Spinner (BRITE Submenu)**:
  - Move `"cmp"` from `BRITE_DISABLED_CHANNELS` to `BRITE_PAINT_CHANNELS` in `src/scope/palette.ts`.
  - Update `BRITE_GRID_LAYOUT` in `DisplayControlBarMenus.tsx` to bind `channel: "cmp"`, enabling the live spinner cap.
  - Wire `view.brite.cmp` into range ring tick mark / compass rendering in `src/scope/renderScope.ts` and `mapLayers.ts`.
- **`BCN` Spinner (BRITE Submenu)**:
  - Move `"bcn"` from `BRITE_DISABLED_CHANNELS` to `BRITE_PAINT_CHANNELS` in `src/scope/palette.ts`.
  - Update `BRITE_GRID_LAYOUT` in `DisplayControlBarMenus.tsx` to bind `channel: "bcn"`, enabling the live spinner cap.
  - Wire `view.brite.bcn` into secondary beacon target symbol rendering (`targetSymbol.ts` / `renderScope.ts`).
- **PREF Persistence**:
  - Ensure `brite.cmp` and `brite.bcn` persist and restore cleanly with DCB PREF sets.

## Out of scope

- SSA filter submenu changes.
- Complex radar site reconfiguration.

## Acceptance criteria

- [ ] **AC1 —** `CMP` is an active spinner on the `BRITE` submenu cycling 0–100% in steps of 10.
- [ ] **AC2 —** `CMP` brightness modulates range ring ticks / compass markings on the PPI.
- [ ] **AC3 —** `BCN` is an active spinner on the `BRITE` submenu cycling 0–100% in steps of 10.
- [ ] **AC4 —** `BCN` brightness modulates secondary radar beacon target symbol rendering on the PPI.
- [ ] **AC5 —** Both channels persist and restore via PREF slot profiles.
- [ ] **AC6 —** Unit and integration tests verify stepping, rendering, and persistence.

## Test plan

- Unit: `src/scope/dcb/test/dcbFunctions.test.ts` (test CMP/BCN brightness stepping).
- Render: `src/scope/test/palette.test.ts` (test CMP/BCN channel palette brightness multiplication).
- UI: `src/ui/dcb/test/dcbPhysicalReplicaAcceptance.test.ts` (verify active spinners on the BRITE grid).
