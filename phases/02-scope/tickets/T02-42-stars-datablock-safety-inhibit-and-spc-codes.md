# T02-42 STARS datablock Special Purpose Codes (SPCs)

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-36, T04-09
**Blocks:** T02-43
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align Line 1 Special Purpose Code (SPC) tags with FAA STARS CRC specifications:
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

*(Note: Manual user-invoked inhibit glyphs like `▲` for CA inhibit and `*` for MSAW inhibit are deferred to `phases/LATER-IMPLEMENTATION-BACKLOG.md` pending future `<MULTI FUNC>` keypad chords).*

## Context

In FAA STARS TRACON displays, Line 1 of the Full Data Block provides instant tactical awareness for emergency transponder codes and operational conditions. Squawking standard emergency transponder codes or assigning operational SPC tags places prominent 2-letter indicators on Line 1.

## Research

Read **docs.virtualnas.net/crc/stars** (Special Purpose Codes, Full Data Blocks).
- Search: `STARS Special Purpose Codes SPC EM RF HJ MI LL OD ME MF LN`
- **Terms:** **SPC**, **emergency squawk**, **tactical SPC**.
- Comment: Line 1 renders 2-letter SPC tags for emergency squawks (7700, 7600, 7500, 7777, 7400) and tactical conditions (OD, ME, MF, LN).

## Scope

- Extend `DatablockSource` and `trackDisplay.ts` in `src/scope/datablock.ts`:
  - Add support for expanded SPC codes: `"EM" | "RF" | "HJ" | "MI" | "LL" | "OD" | "ME" | "MF" | "LN" | string`.
- Implement automatic derivation of squawk-based SPCs from transponder code:
  - `7700` -> `"EM"`
  - `7600` -> `"RF"`
  - `7500` -> `"HJ"`
  - `7777` -> `"MI"`
  - `7400` -> `"LL"`
- Format Line 1 layout in `formatFullDatablock`:
  - Base: `<Callsign>`
  - SPC tag: append SPC indicator (`EM`, `RF`, `HJ`, `MI`, `LL`, `OD`, `ME`, `MF`, `LN`) separated by a space (e.g. `DAL123 EM`).
  - Handoff / Pointout cues: append pending tags (`PO`, transferring TCP) as appropriate.
- Ensure SPC codes render with high visual clarity and proper spacing.

## Out of scope

- Multi-phase Line 2 time-sharing (T02-41).
- Manual inhibit command chords / glyphs (deferred to `phases/LATER-IMPLEMENTATION-BACKLOG.md`).

## Implementation notes

- Modify `src/scope/datablock.ts`, `src/scope/trackDisplay.ts`, `src/scope/renderScope.ts`.
- Update and add tests in `src/scope/datablock.test.ts`, `src/scope/renderScope.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** Squawk codes 7700 (`EM`), 7600 (`RF`), and 7500 (`HJ`) automatically display their respective SPC on Line 1.
- [ ] **AC2 —** Squawk codes 7777 (`MI`) and 7400 (`LL`) automatically display their respective SPC on Line 1.
- [ ] **AC3 —** Manual / tactical SPCs (`OD`, `ME`, `MF`, `LN`) render properly when set on the track display.
- [ ] **AC4 —** Formatting handles combinations of callsign + SPC + handoff cleanly without line wrapping or truncation.
- [ ] **AC5 —** Unit tests verify all SPC squawk mappings and Line 1 string construction.

## Test plan

- Unit tests for all squawk-to-SPC conversions (7700, 7600, 7500, 7777, 7400).
- Unit tests for manual SPC tags (`OD`, `ME`, `MF`, `LN`).
- Unit tests for Line 1 string output with various combinations of SPC tags.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
