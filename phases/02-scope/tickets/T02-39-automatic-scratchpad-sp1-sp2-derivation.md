# T02-39 Automatic scratchpad (SP1/SP2) derivation from aircraft intent

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-19, T02-36
**Blocks:** T02-41, T02-43
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement dual scratchpad tracking (`sp1` and `sp2`) on `TrackDisplay` with automatic derivation from aircraft clearances and tactical intent:
- **Approach Shorthand**:
  - ILS -> `I` + runway (e.g. `ILS 27` -> `I27`, `ILS 04R` -> `I04R`)
  - RNAV / RNP -> `R` + runway (e.g. `RNAV 22L` -> `R22L`)
  - Visual -> `V` + runway (e.g. `VIS 28` -> `V28`)
  - Localizer -> `L` + runway (e.g. `LOC 09` -> `L09`)
  - VOR -> `O` + runway (e.g. `VOR 15` -> `O15`)
- **Assigned Altitude**: 3 digits in hundreds of feet (e.g. `040` for 4000 ft, `100` for 10000 ft) when assigned altitude differs from Mode C altitude.
- **Assigned Speed**: `S` + 2-digit tens of knots (e.g. `S21` for 210 kt, `S18` for 180 kt, `S25` for 250 kt).
- **Slot Allocation (Option A standard)**:
  - **SP1**: Cleared or expected approach shorthand (highest priority) OR assigned altitude (`040`) if no approach is assigned.
  - **SP2**: Assigned speed (`S21`).
- Support manual override while preserving automatic derivation when manual entries are absent or cleared.

## Context

In standard STARS TRACON operations (and STARS CRC at docs.virtualnas.net/crc/stars), scratchpads are essential for quick tactical reference without cluttering Line 1. Modern STARS configurations feature dual scratchpads (SP1 and SP2) that time-share with Mode C altitude on Line 2. Controllers use SP1 for approach/runway assignments or interim altitudes and SP2 for assigned speeds. Automating this derivation from FMS intent and radio clearances mirrors realistic facility automation while retaining manual editability.

## Research

Read **docs.virtualnas.net/crc/stars** (Scratchpad Entry, Dual Scratchpad, Approach Codes).
- Search: `STARS dual scratchpad SP1 SP2 approach shorthand assigned speed altitude CRC`
- **Terms:** **SP1**, **SP2**, **approach shorthand**, **assigned speed**, **assigned altitude**, **scratchpad derivation**.
- Comment: SP1 holds approach code (I27, R22L) or assigned altitude (040); SP2 holds assigned speed (S21).

## Scope

- Extend `TrackDisplay` in `src/scope/trackDisplay.ts`:
  - Replace or augment single `scratchpad?: string` with `sp1?: string`, `sp2?: string`, `manualSp1?: string`, `manualSp2?: string`.
  - Maintain backward compatibility with legacy `scratchpad` property (aliases to `sp1`).
- Implement automatic derivation helper (e.g. `deriveScratchpads(aircraft, trackDisplay)`):
  - **Approach Shorthand Generator**:
    - Inspect aircraft navigation / approach intent (`clearedApproach`, `expectedApproach`, `assignedRunway`).
    - Map approach types:
      - `ILS` -> `I` + runway (e.g. `I27`, `I04R`)
      - `RNAV` / `RNP` -> `R` + runway (e.g. `R22L`, `R28`)
      - `VISUAL` / `VIS` -> `V` + runway (e.g. `V28`)
      - `LOC` / `LOCALIZER` -> `L` + runway (e.g. `L09`)
      - `VOR` -> `O` + runway (e.g. `O15`)
  - **Assigned Altitude Shorthand Generator**:
    - When `assignedAltitudeFt` differs from Mode C altitude by $\ge 100$ ft and no approach shorthand is assigned to SP1, format as 3 digits in hundreds (e.g. `040`, `110`).
  - **Assigned Speed Shorthand Generator**:
    - When `assignedSpeedKt` exists (e.g. 210, 180), format as `S` + 2-digit tens (e.g. `S21`, `S18`).
  - **Slot Allocation Policy**:
    - SP1: Manual `manualSp1` if set; otherwise derived Approach Shorthand if present; otherwise derived Assigned Altitude if present; otherwise empty.
    - SP2: Manual `manualSp2` if set; otherwise derived Assigned Speed if present; otherwise empty.
- Ensure sanitization rules apply (A–Z0–9, max length clamped to 4 characters per slot).
- Export scratchpad derivation functions and types for datablock formatting and tests.

## Out of scope

- Multi-phase Line 2 time-sharing rotation (T02-41).
- Groundspeed in tens formatting (T02-40).
- Inter-facility coordination scratchpad broadcast.

## Implementation notes

- Modify `src/scope/trackDisplay.ts`, `src/scope/datablock.ts`.
- Add test coverage in `src/scope/trackDisplay.test.ts`, `src/scope/datablock.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** `TrackDisplay` maintains dual scratchpad state (`sp1`, `sp2`) with manual override support.
- [ ] **AC2 —** Approach clearances automatically derive correct shorthand into SP1 (`I27`, `R22L`, `V28`, `L09`, `O15`).
- [ ] **AC3 —** When no approach is assigned, differing assigned altitude automatically derives 3-digit hundreds into SP1 (e.g. `040`).
- [ ] **AC4 —** Assigned speed automatically derives into SP2 with `S` prefix and 2-digit tens (e.g. `S21` for 210 kt, `S18` for 180 kt).
- [ ] **AC5 —** Manual scratchpad entries take precedence over auto-derived values and can be cleared to restore derivation.
- [ ] **AC6 —** Comprehensive unit tests verify approach mapping, altitude derivation, speed derivation, and slot prioritization.

## Test plan

- Unit tests for `deriveScratchpads` with various combinations of approach clearances, altitude changes, and speed restrictions.
- Unit tests verifying runway format edge cases (`27`, `04R`, `22L`, `09C`).
- Unit tests for manual override and reset semantics.

## Suggested files

- `src/scope/trackDisplay.ts`
- `src/scope/trackDisplay.test.ts`
- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
