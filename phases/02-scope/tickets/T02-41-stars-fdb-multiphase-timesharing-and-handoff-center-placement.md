# T02-41 STARS FDB multi-phase time-sharing and handoff center placement

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** L
**Depends on:** T02-36, T02-37, T02-39, T02-40
**Blocks:** T02-43
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align STARS Full Data Block (FDB) and Partial Data Block (PDB) Line 2 time-sharing with real-world multi-phase cycling and center handoff sector indicator placement:
- **Line 2 Left-Side Multi-Phase Rotation**:
  - Independent rotation cycling through: `Mode C altitude` $\leftrightarrow$ `SP1` $\leftrightarrow$ `SP2`.
  - Automatically omit unpopulated/empty scratchpad fields so that empty phases do not display blank intervals (e.g. if only SP1 exists, cycle `Mode C` $\leftrightarrow$ `SP1`; if no scratchpad exists, hold `Mode C` steady).
- **Line 2 Right-Side Multi-Phase Rotation**:
  - Independent rotation cycling through: `GS (tens)` $\leftrightarrow$ `Aircraft Type` $\leftrightarrow$ `Requested Altitude (R###)`.
  - Omit unpopulated fields (e.g. if no requested altitude, cycle `GS` $\leftrightarrow$ `Aircraft Type`).
- **Line 2 Center Field Handoff Indicator**:
  - Render transferring or receiving sector ID letter (e.g. `D`, `C`, `1`) in the center position between left and right fields during active handoff initiation / negotiation.
- **PDB Line 2 Time-Sharing**:
  - Apply corresponding time-sharing to PDBs (cycling left-side Mode C / SP1 / SP2 and right-side GS / Type).

## Context

In FAA STARS TRACON systems, Line 2 is multiplexed to maximize information density in minimal screen real estate. The left side and right side of Line 2 cycle independently through their active data queues at ~2.5-second intervals. When scratchpads or requested altitudes are omitted, the display smoothly collapses to only the populated entries. Furthermore, during inbound and outbound handoff transfers, the center position of Line 2 indicates the collaborating sector ID letter.

## Research

Read **docs.virtualnas.net/crc/stars** (Full Data Blocks, Time Sharing, Handoffs, Dual Scratchpad).
- Search: `STARS FDB time-sharing multi-phase SP1 SP2 center handoff sector ID PDB time sharing`
- **Terms:** **time-share phase**, **SP1 cycle**, **SP2 cycle**, **center handoff ID**, **PDB time-sharing**.
- Comment: Left cycles Mode C/SP1/SP2; right cycles GS/Type/Req Alt; center shows handoff sector ID.

## Scope

- Update `formatFullDatablock` and `formatPartialDatablock` in `src/scope/datablock.ts`:
  - Calculate left-field cycle list from available elements:
    - Elements: `[Mode C altitude, SP1, SP2]` filtered to only present/non-empty entries (Mode C is always present unless modeCVisible=false).
    - Phase calculation: $\text{leftIndex} = \lfloor(\text{simTimeMs} / \text{interval}) \rfloor \pmod{\text{leftElements.length}}$.
  - Calculate right-field cycle list from available elements:
    - Elements: `[GS (tens), Aircraft Type, Requested Altitude (R###)]` filtered to present entries.
    - Phase calculation: $\text{rightIndex} = \lfloor(\text{simTimeMs} / \text{interval}) \rfloor \pmod{\text{rightElements.length}}$.
  - Center field formatting:
    - If track has active handoff state (`handoff.inbound` or `handoff.outbound`), render the handoff sector ID character in the center position.
  - Assemble Line 2 string: `<LeftField>  [<CenterField>]  <RightField>`.
- Update `PartialDatablockOpts` and `formatPartialDatablock` to use the same dynamic time-sharing rotation (omitting fields suppressed by `suppressPdbSpeed` or hidden Mode C).
- Support explicit phase indexing / testing overrides for deterministic rendering in snapshots and unit tests.

## Out of scope

- Scratchpad automatic derivation algorithms (T02-39).
- Safety inhibit glyphs and SPC tags on Line 1 (T02-42).

## Implementation notes

- Modify `src/scope/datablock.ts`, `src/scope/renderScope.ts`, `src/scope/trackDisplay.ts`.
- Update and add tests in `src/scope/datablock.test.ts`, `src/scope/renderScope.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** Left field of FDB Line 2 cycles cleanly between `Mode C`, `SP1`, and `SP2` every ~2.5s.
- [ ] **AC2 —** Empty/unassigned scratchpad slots are skipped without blank or dead display phases.
- [ ] **AC3 —** Right field of FDB Line 2 cycles cleanly between `GS (tens)`, `Aircraft Type`, and `Requested Altitude (R###)`.
- [ ] **AC4 —** During active inbound/outbound handoff, the target sector ID character appears in the center of Line 2.
- [ ] **AC5 —** PDB Line 2 supports multi-phase time-sharing consistent with populated fields.
- [ ] **AC6 —** Unit tests verify multi-phase index calculation, skipping of empty fields, and center handoff placement.

## Test plan

- Unit tests stepping `simTimeMs` through $t = 0\text{ s}, 2.5\text{ s}, 5.0\text{ s}, 7.5\text{ s}$ with 1, 2, and 3 populated left/right fields.
- Unit tests verifying center handoff sector ID during inbound and outbound handoff states.
- Unit tests verifying PDB time-sharing behavior.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
