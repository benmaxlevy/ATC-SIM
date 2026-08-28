# T02-64 STARS Scope Centering, Range Rings, PTL, & History Commands

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-61
**Blocks:** T02-67
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the complete STARS Display & Scope Manipulation keyboard commands (Table 28 / Table 36) in the Preview Area: scope re-centering (`* C`, `* OFF`), range ring spacing and offset origin (`* RR [Spacing]`, `* RR C`, `* RR OFF`), predicted track line duration (`* PTL [Min]`), and radar history trail count (`* HIST [0-9]`).

## Context

In FAA STARS and CRC operations, controllers adjust spatial radar display parameters via quick typed chords. Re-centering on an airspace fix or runway threshold, repositioning range rings, and changing velocity vector / history lengths are primary display manipulation tasks.

## Research

- **Analog:** CRC STARS Command Reference Table 28 / Table 36 (docs.virtualnas.net/crc/stars — R07).
  - `* C <ENTER> <SLEW>`: Recenter radar scope to clicked coordinates.
  - `* OFF <ENTER>`: Reset radar scope center to airport ARP.
  - `* RR [Spacing] <ENTER>`: Set range ring spacing (2, 5, 10, 20 NM).
  - `* RR C <ENTER> <SLEW>`: Recenter range rings to clicked coordinates.
  - `* RR OFF <ENTER>`: Reset range rings center back to scope center.
  - `* PTL [Min] <ENTER>`: Set Predicted Track Line length in minutes (0–15).
  - `* HIST [0-9] <ENTER>`: Set radar history dot count (0–9).
- **Glossary:** Scope Center, Facility Origin, Range Ring Spacing, Off-Center RR, PTL Duration, History Trail Dots.
- **Trainer delta:** Interacts with `view.camera`, `centerOnAirport`, `stepRrInterval`, `view.ringIntervalNm`, `view.ptlMinutes`, and `view.historyDots`.

## Scope

- Extend `PreviewArmedAction` with display manipulation actions:
  - `{ type: "armRecenterScope" }`
  - `{ type: "resetScopeCenter" }`
  - `{ type: "setRangeRingInterval"; intervalNm: number }`
  - `{ type: "armRecenterRangeRings" }`
  - `{ type: "resetRangeRingsCenter" }`
  - `{ type: "setPtlMinutes"; minutes: number }`
  - `{ type: "setHistoryDots"; count: number }`
- Parse scope centering commands:
  - `* C <Enter>` $\rightarrow$ arms center-on-slew; subsequent canvas click recenters camera origin.
  - `* OFF <Enter>` $\rightarrow$ immediately resets center to facility ARP (`centerOnAirport(view)`).
- Parse range ring commands:
  - `* RR 2`, `* RR 5`, `* RR 10`, `* RR 20` + `<Enter>` $\rightarrow$ sets `view.ringIntervalNm` and turns rings on.
  - `* RR C <Enter>` $\rightarrow$ arms place-range-rings on click; subsequent canvas click updates `view.rangeRingCenterNm`.
  - `* RR OFF <Enter>` $\rightarrow$ resets range ring origin back to scope center.
- Parse PTL duration:
  - `* PTL [0-15] <Enter>` $\rightarrow$ sets PTL duration in minutes; `* PTL 0` inhibits PTL line.
- Parse history dot count:
  - `* HIST [0-9] <Enter>` $\rightarrow$ sets history dot count (0 disables history; 1–9 sets trail length).
- Reject out-of-range parameters (e.g. `* RR 7`, `* PTL 25`, `* HIST 12`) with `<buffer> INV`.

## Out of scope

- Physical DCB spinner dragging (already completed in T02-58).
- Multi-channel brightness adjustments (already completed in T02-59).
- Video map toggles (owned by T02-63).

## Acceptance criteria

- [ ] **AC1 —** `* C <Enter>` followed by a scope click recenters the camera to the clicked world coordinate; `* OFF <Enter>` recenters to KDEM ARP.
- [ ] **AC2 —** `* RR [Spacing] <Enter>` sets range ring spacing to 2, 5, 10, or 20 NM.
- [ ] **AC3 —** `* RR C <Enter>` followed by a scope click relocates the range ring center; `* RR OFF <Enter>` resets it to scope center.
- [ ] **AC4 —** `* PTL [0-15] <Enter>` sets the PTL duration in minutes; `* HIST [0-9] <Enter>` sets radar history trail length.
- [ ] **AC5 —** Invalid parameters trigger `... INV` flash and preserve current settings.
- [ ] **AC6 —** Automated tests verify centering, range ring placement, PTL, and history adjustments.

## Test plan

- Unit: `src/scope/previewArea.test.ts` (centering, RR, PTL, and HIST command parsing).
- Integration: `src/scope/camera.test.ts` / `src/scope/previewArea.integration.test.ts` (camera pan mutation, range ring center offset).

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/camera.ts`
- `src/scope/dcbFunctions.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.test.ts`
