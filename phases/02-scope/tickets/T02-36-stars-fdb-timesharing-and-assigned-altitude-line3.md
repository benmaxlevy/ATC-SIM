# T02-36 STARS Full Data Block dynamic time-sharing and Line 3 layout

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** L
**Depends on:** T02-04, T02-19, T02-35
**Blocks:** T02-37, T02-38
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align the Full Data Block (FDB) structure and field rotation with the real STARS specification:
- **Line 1 (Aircraft Identification)**: Callsign + Special Purpose Code (SPC) 2-letter indicators (`EM`, `RF`, `HJ`, `MI`, `LL`, `OD`, `ME`, `MF`, `LN`) + Pointout/Handoff tags (`PO`, transferring TCP) + Conflict Alert `CA`/`MSAW` + pilot-reported altitude `*` indicator.
- **Line 2 (Time-Sharing / Multiplexed Fields)**:
  - **Left field**: Mode C altitude (hundreds of ft, e.g. `030`) time-sharing (alternating every ~2.5s) with Scratchpad #1 / Scratchpad #2 or transferring sector ID.
  - **Center field**: Single character indicating handoff recipient sector ID.
  - **Right field**: Ground speed (tens of knots or knots) time-sharing with aircraft type (e.g. `B738`), requested altitude (`R070`), and wake/RNAV category indicator (`H`, `B`, `R`, `J`, `M`, `F`, `L` or CWT `A`–`I`).
- **Line 3 (Special & Assigned Fields)**:
  - Assigned altitude prefixed with `A` (e.g. `A040`) when temporary altitude is assigned and differs from Mode C.
  - Reported vs assigned beacon code when squawk mismatch occurs.
  - ATPA distance to lead aircraft when enabled.

## Context

Our current FDB implementation packs Mode C altitude, assigned altitude, ground speed, and scratchpad onto Line 2 in a static multi-column format (`030  040  210  ABC1`), and places aircraft type on Line 3. STARS CRC uses field time-sharing on Line 2 (cycling between altitude/scratchpad on the left and ground speed/aircraft type on the right) and places temporary assigned altitude on Line 3 prefixed with `A`.

## Research

Read **docs.virtualnas.net/crc/stars** (Full Data Blocks, Special Purpose Codes, Category Indicators).
- Search: `STARS Full Data Block time-sharing assigned altitude line 3 CWT wake category`
- **Terms:** **FDB**, **time-share**, **assigned altitude**, **requested altitude**, **wake turbulence category**, **CWT**.
- Comment: FDB line 2 time-shares altitude with scratchpad, and ground speed with type/requested altitude. Line 3 shows assigned altitude prefixed with A.

## Scope

- Update `src/scope/datablock.ts` to implement time-shared field formatting parameterized by `simTimeMs`:
  - Cycle interval: ~2.5 seconds per phase (Phase A: Mode C + GS; Phase B: Scratchpad + Type/Requested Alt).
  - Mode C altitude field: 3 digits hundreds (e.g. `030`), appended with `*` if pilot-reported.
  - Ground speed: 2 or 3 digits (e.g. `21` for 210 kt or `210` depending on preference), appended with wake/RNAV category letter (e.g. `21H`, `21R`).
  - Scratchpad: 1–4 characters alphanumeric.
  - Aircraft type: ICAO type code (e.g. `B738`).
  - Requested altitude: Prefixed with `R` (e.g. `R070`).
- Line 3 formatting:
  - If `assignedAltitudeFt` differs from `altitudeFt` by $\ge 100$ ft, render `A` + hundreds (e.g. `A040`).
  - If assigned squawk differs from reported squawk, render mismatch.
  - If neither applies, omit Line 3 unless ATPA distance is active.
- Line 1 formatting:
  - Render callsign followed by any active SPC code (`EM`, `RF`, `HJ`), pending handoff sector, pointout tag (`PO`), or alert (`CA`/`MSAW`).

## Out of scope

- Pointout negotiation protocol (T02-37).
- Audio tone synthesis for emergency squawk codes (already handled by alert system).
- Live CWT pairwise matrix calculation.

## Implementation notes

- Modify `src/scope/datablock.ts`, `src/scope/renderScope.ts`, `src/scope/trackDisplay.ts`.
- Update and add tests in `src/scope/datablock.test.ts`, `src/scope/renderScope.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** FDB Line 2 alternates between [Mode C altitude + Ground speed] and [Scratchpad + Aircraft type / requested altitude].
- [ ] **AC2 —** Line 3 displays assigned altitude prefixed with `A` (e.g. `A040`) when an assigned altitude differs from current altitude.
- [ ] **AC3 —** Requested altitude on Line 2 is prefixed with `R` (e.g. `R070`) when displayed.
- [ ] **AC4 —** Wake turbulence / RNAV category letters (`H`, `B`, `R`, `L`, etc.) append to the ground speed field when applicable.
- [ ] **AC5 —** Special Purpose Code tags (`EM`, `RF`, `HJ`) render cleanly on Line 1 next to the callsign.
- [ ] **AC6 —** Unit tests verify time-sharing cycle at different simulation timestamps and line 3 assigned altitude presence.

## Test plan

- Unit tests verifying `formatFullDatablock` output at $t = 0\text{ s}$ and $t = 2.5\text{ s}$.
- Unit tests for assigned altitude line 3 (`A030`) when climbing/descending to an assigned level.
- Visual check on PPI ensuring datablock width and height metrics accommodate dynamic time-sharing text cleanly.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/trackDisplay.ts`
