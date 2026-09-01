# T02-81 DCB VOL, MODE FSL, and BRITE BKC Controls

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** None
**Blocks:** T02-82, T02-83
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Enable the previously disabled DCB controls: `VOL` (workstation aural alert volume), `MODE FSL` (global datablock mode toggle between Full, Semi, and Limited), and `BRITE BKC` (scope canvas background contrast spinner).

## Context

On the physical STARS Display Control Bar:
- `VOL` (AUX row, column 2) is a spinner controlling the STARS aural alert tone gain (Conflict Alert tone `CA_TONE_GAIN`). In real ATC facilities, pilot voice communications are handled on the separate VSCS panel, so `VOL` strictly modulates STARS workstation aural alerts.
- `MODE FSL` (MAIN row, column 18) is a 3-state toggle latch switching the default datablock display mode across all non-selected targets (`FULL` -> `SEMI` -> `LMTD`).
- `BRITE BKC` (BRITE submenu, column 14) is a brightness spinner (0–100%) controlling the scope background canvas contrast/brightness.

Currently in the codebase, `mode-fsl` in `dcbLayouts.ts` is marked as `disabled`, `VOL` is not wired to alert tone gain, and `BRITE BKC` is a placeholder spinner.

## Scope

- **`VOL` Spinner (AUX DCB)**:
  - Wire `VOL` (0–100%, default 100% or 50%) to `caAlertTone` volume multiplier.
  - At 0% volume, CA aural alert tone is silenced (`gain = 0`).
  - Keep pilot voice playback levels untouched on the radio line.
- **`MODE FSL` Latch (MAIN DCB)**:
  - Replace `disabled` `mode-fsl` cell with a 3-state latch (`kind: "toggle"` or cycle action).
  - Cycle states: `MODE F` (Full Data Block), `MODE S` (Semi / Partial Data Block), `MODE L` (Limited Data Block).
  - When in `MODE S`, unselected associated tracks display PDB instead of FDB.
  - When in `MODE L`, unselected unassociated tracks display LDB.
  - Selected / hovered tracks still respect explicit FDB / selection state.
- **`BRITE BKC` Spinner (BRITE Submenu)**:
  - Wire `BRITE BKC` (0–100%) in `BriteState.bkc` to scope background clear color in canvas renderer (e.g. interpolate from pure black `#000000` / `#050811` to dark slate `#141c2b`).
- **PREF Persistence**:
  - Persist `vol`, `modeFsl`, and `brite.bkc` in DCB PREF state.

## Out of scope

- SSA WX status / WX HIST telemetry (T02-82).
- Full end-to-end multi-feature acceptance (T02-83).
- Changing pilot radio voice graph or TTS/STT pipelines.

## Acceptance criteria

- [ ] **AC1 —** DCB `VOL` spinner modulates CA alert tone audio gain linearly from 0 (silent) to 1.0.
- [ ] **AC2 —** DCB `MODE FSL` is an active 3-way toggle cycling `MODE F` -> `MODE S` -> `MODE L` and updates the global default datablock presentation.
- [ ] **AC3 —** `BRITE BKC` spinner modulates background contrast in `BriteState` and canvas clear color.
- [ ] **AC4 —** Settings for `vol`, `modeFsl`, and `brite.bkc` persist across PREF save/restore.
- [ ] **AC5 —** Unit and UI tests pass with zero regressions across existing DCB and scope tests.
