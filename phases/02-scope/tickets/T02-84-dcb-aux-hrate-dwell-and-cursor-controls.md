# T02-84 DCB AUX H_RATE, DWELL, and Cursor Controls

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** None
**Blocks:** T02-85, T02-86
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Enable the active controls on AUX DCB: `H_RATE` (history scan rate spinner), `DWELL` (dwell mode `OFF` / `ON` / `LOCK`), `CURSOR HOME` (toggle with preview status), and `CSR SPD` (cursor speed multiplier spinner).

## Context

On the physical STARS AUX Display Control Bar (docs.virtualnas.net/crc/stars — R07 and Vice `stars/dcb.go`):
- `H_RATE` (AUX row 2, column 2, paired vertically below `HISTORY`): Spinner that adjusts the scan rate / sample interval (in seconds) between successive history dot recordings.
- `DWELL` (AUX row 1, column 14): Dwell mode control cycling `OFF`, `ON`, `LOCK`. In `ON` mode, datablocks brighten on mouse hover. In `LOCK` mode, datablocks remain highlighted on the last hovered target until moving near another target.
- `CURSOR HOME` (AUX row 1, column 3): Toggle for cursor home state, echoing `HOME` / `NO HOME` to the preview area status line.
- `CSR SPD` (AUX row 1, column 4): Spinner (1–10, default 4) controlling cursor / trackball slewing speed multiplier.

## Scope

- **`H_RATE` (History Rate Spinner)**:
  - Add `historyRateSec: number` on `ScopeView` (presets: `[1.0, 2.0, 3.0, 4.0, 4.5, 5.0, 6.0, 8.0, 10.0]` s, default `4.5` s).
  - Add `stepHistoryRate(view, delta)` and `formatDcbHistoryRateReadout(rate)` in `src/scope/dcb/dcbFunctions.ts`.
  - In `recordHistoryOnReport` / `syncTrackDisplays` / `history.ts`, sample a new history dot only when `simTimeMs - lastDotTime >= view.historyRateSec * 1000`.
  - Convert `h-rate` in `DisplayControlBarMenus.tsx` from disabled to an active spinner (`H_RATE` / readout value).
- **`DWELL` (Dwell Mode Control)**:
  - Add `dwellMode: "OFF" | "ON" | "LOCK"` and `dwellLockedAircraftId: string | null` to `ScopeView`.
  - Add `stepDwellMode(view, delta)` and `cycleDwellMode(view)` in `src/scope/dcb/dcbFunctions.ts`.
  - In `renderScope.ts` and pointer move handlers, detect mouse hover over target symbols:
    - If `dwellMode === "ON"`: brighten the hovered track's datablock text / leader.
    - If `dwellMode === "LOCK"`: lock brightness on the hovered track until another track is hovered.
    - If `dwellMode === "OFF"`: normal brightness.
  - Convert `dwell-on` in `DisplayControlBarMenus.tsx` to an active spinner/toggle.
- **`CURSOR HOME` & `CSR SPD`**:
  - Add `cursorHome: boolean` (default `false`) and `cursorSpeed: number` (1–10, default `4`) on `ScopeView`.
  - Add `toggleCursorHome(view)` and `stepCursorSpeed(view, delta)` in `dcbFunctions.ts`.
  - Convert `cursor-home` cell into a toggle cap in `DisplayControlBarMenus.tsx`.
  - Convert `csr-spd` cell into an active spinner cap in `DisplayControlBarMenus.tsx`.
- **PREF Persistence**:
  - Persist `historyRateSec`, `dwellMode`, `cursorHome`, and `cursorSpeed` in DCB PREF slot schema.

## Out of scope

- SSA filter submenu changes.
- Complex TSAS timeline calculations.
- BRITE channel spinners (T02-85).

## Acceptance criteria

- [ ] **AC1 —** `H_RATE` is an active spinner on AUX DCB cycling presets (`1.0`–`10.0` s) and gates history dot recording interval.
- [ ] **AC2 —** `DWELL` is an active spinner/toggle on AUX DCB cycling `OFF`, `ON`, `LOCK` and brightens datablocks under mouse hover according to selected mode.
- [ ] **AC3 —** `CURSOR HOME` is an active toggle button on AUX DCB.
- [ ] **AC4 —** `CSR SPD` is an active spinner (1–10) on AUX DCB.
- [ ] **AC5 —** All settings persist and restore via DCB PREF slots.
- [ ] **AC6 —** Unit and integration tests cover all four controls with zero regressions.

## Test plan

- Unit: `src/scope/dcb/test/dcbFunctions.test.ts` (test `H_RATE`, `DWELL`, `CURSOR HOME`, and `CSR SPD` stepping and state mutations).
- Render: `src/scope/test/history.test.ts` (test history rate gating).
- UI: `src/ui/dcb/test/dcbAddendumAcceptance.test.ts` (test AUX DCB active caps and readouts).
