# T02-42 STARS datablock safety inhibit glyphs and Special Purpose Codes (SPCs)

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-36, T04-09
**Blocks:** T02-43
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align Line 1 safety inhibit symbols and Special Purpose Code (SPC) tags with FAA STARS CRC specifications:
- **Line 1 Safety Inhibit Glyphs**:
  - Render an asterisk `*` immediately following the callsign for tracks with Minimum Safe Altitude Warning (MSAW) inhibited (or standard VFR tracks).
  - Render a solid triangle `▲` (or equivalent standard STARS inhibit glyph) immediately following the callsign for Conflict Alert (CA) inhibited tracks.
- **Expanded Special Purpose Codes (SPCs)** on Line 1:
  - **Squawk-Based SPCs**:
    - `7700` -> `EM` (Emergency)
    - `7600` -> `RF` (Radio Failure / Lost Comm)
    - `7500` -> `HJ` (Hijack)
    - `7777` -> `MI` (Military Intercept)
    - `7400` -> `LL` (Lost Link / UAS)
  - **Manual / Tactical SPCs**:
    - `OD` -> Opposite Direction operation
    - `ME` -> Medical Emergency
    - `MF` -> Minimum Fuel
    - `LN` -> Medevac / LifeGuard flight

## Context

In FAA STARS TRACON displays, Line 1 of the Full Data Block provides instant tactical awareness for safety alert status and emergency conditions. When CA or MSAW processing is inhibited for a specific aircraft (e.g. low-altitude maneuvering or VFR operations), safety inhibit glyphs are displayed right beside the callsign. In addition, squawking standard emergency transponder codes or manually assigning operational SPC tags places prominent 2-letter indicators on Line 1.

## Research

Read **docs.virtualnas.net/crc/stars** (Special Purpose Codes, Safety Processing, Full Data Blocks).
- Search: `STARS Special Purpose Codes SPC EM RF HJ MI LL OD ME MF LN safety inhibit CA MSAW`
- **Terms:** **SPC**, **safety inhibit glyph**, **MSAW inhibit**, **CA inhibit**, **emergency squawk**.
- Comment: Asterisk for MSAW inhibit; triangle for CA inhibit. Line 1 renders 2-letter SPC tags for emergency squawks and tactical conditions.

## Scope

- Extend `DatablockSource` and `trackDisplay.ts` in `src/scope/datablock.ts`:
  - Add safety flags: `msawInhibited?: boolean`, `caInhibited?: boolean`.
  - Add support for expanded SPC codes: `"EM" | "RF" | "HJ" | "MI" | "LL" | "OD" | "ME" | "MF" | "LN" | string`.
- Implement automatic derivation of squawk-based SPCs from transponder code:
  - `7700` -> `"EM"`
  - `7600` -> `"RF"`
  - `7500` -> `"HJ"`
  - `7777` -> `"MI"`
  - `7400` -> `"LL"`
- Format Line 1 layout in `formatFullDatablock`:
  - Base: `<Callsign>`
  - Safety Inhibit suffix: append `*` if `msawInhibited` (or VFR pilot-reported), append `▲` if `caInhibited`.
  - SPC tag: append SPC indicator (`EM`, `RF`, `HJ`, `MI`, `LL`, `OD`, `ME`, `MF`, `LN`) separated by a space.
  - Handoff / Pointout cues: append pending tags (`PO`, transferring TCP) as appropriate.
- Ensure safety glyphs and SPC codes render with high visual clarity and proper spacing.

## Out of scope

- Multi-phase Line 2 time-sharing (T02-41).
- Automatic terrain elevation collision mesh calculation (handled in core safety logic).

## Implementation notes

- Modify `src/scope/datablock.ts`, `src/scope/trackDisplay.ts`, `src/scope/renderScope.ts`.
- Update and add tests in `src/scope/datablock.test.ts`, `src/scope/renderScope.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** Callsigns with MSAW inhibited render with an asterisk `*` suffix on Line 1 (e.g. `DAL123*`).
- [ ] **AC2 —** Callsigns with Conflict Alert inhibited render with a `▲` suffix on Line 1 (e.g. `UAL456▲`).
- [ ] **AC3 —** Squawk codes 7700 (`EM`), 7600 (`RF`), 7500 (`HJ`), 7777 (`MI`), and 7400 (`LL`) automatically display their respective SPC on Line 1.
- [ ] **AC4 —** Manual / tactical SPCs (`OD`, `ME`, `MF`, `LN`) render properly when set on the track display.
- [ ] **AC5 —** Formatting handles combinations of callsign + safety glyph + SPC + handoff cleanly without line wrapping or truncation.
- [ ] **AC6 —** Unit tests verify SPC squawk mapping, safety inhibit glyph rendering, and Line 1 string construction.

## Test plan

- Unit tests for all squawk-to-SPC conversions (7700, 7600, 7500, 7777, 7400).
- Unit tests for manual SPC tags (`OD`, `ME`, `MF`, `LN`).
- Unit tests for Line 1 string output with various combinations of inhibit glyphs (`*`, `▲`).

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
