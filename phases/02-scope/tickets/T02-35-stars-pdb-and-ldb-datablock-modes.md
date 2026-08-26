# T02-35 STARS Limited Data Block (LDB) and Partial Data Block (PDB) modes

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-04, T02-34
**Blocks:** T02-36, T02-38
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement authentic STARS CRC Limited Data Block (LDB) and Partial Data Block (PDB) behavior:
- **LDB**: Displayed for unassociated tracks; contains **Beacon code** and **Mode C altitude** (e.g. `1200 045`). When beacon code is inhibited, displays Mode C altitude only. Clicking target queries and temporarily displays ground speed (e.g. `045 18`).
- **PDB**: Displayed for associated tracks owned by another controller; displays **Line 2 only** (Altitude + Ground Speed, suppressing callsign Line 1).
- Clicking an unowned target with a PDB forces it to a Green Full Data Block (FDB); clicking again returns it to a PDB.
- `F1` (Beaconator / Beacon Code Readout) momentary hold replaces callsign with beacon code across all tracks and forces PDBs to FDBs and unassociated targets to LDBs.

## Context

In our current implementation, LDB displays only Mode C altitude hundreds (e.g. `030`), without beacon code or click-to-query ground speed. PDB is not implemented as a distinct partial view (unowned tracks show full or limited blocks). STARS CRC uses PDBs as the default visual state for tracks owned by adjacent sectors to reduce visual clutter on the TRACON scope.

## Research

Read **docs.virtualnas.net/crc/stars** (Limited Data Blocks, Partial Data Blocks, Beacon Code Readout).
- Search: `STARS Limited Data Block LDB Partial Data Block PDB Beaconator F1`
- **Terms:** **LDB**, **PDB**, **FDB**, **unassociated track**, **beacon code readout**, **query ground speed**.
- Comment: LDB shows squawk + altitude; clicking pops ground speed. PDB shows line 2 only for other controllers' tracks; clicking forces FDB.

## Scope

- Extend `datablock.ts` to support `DatablockMode = "full" | "partial" | "limited"`.
- **Format LDB**:
  - Default: Beacon code + Mode C altitude in hundreds (e.g. `1200 045`).
  - When Mode C is inhibited: Mode C altitude only or blank.
  - Queried state (when clicked): Temporarily display Mode C altitude + Ground speed in tens of knots (e.g. `045 18` or `045 180`) for 5 seconds or until unqueried.
- **Format PDB**:
  - Show Line 2 fields (Mode C altitude, ground speed, optional scratchpad) while omitting Line 1 (callsign) and Line 3 (type/assigned altitude).
- **Interactive Toggles**:
  - Clicking an unowned track in PDB mode toggles it to a Green FDB.
  - Clicking an unowned track in forced FDB mode toggles it back to PDB mode.
  - `F1` key press/hold activates beacon code readout: displays squawk code in place of callsign and forces PDBs to FDBs.
- Brightness: PDB and LDB use `brite.ldb` channel, FDB uses `brite.fdb`.

## Out of scope

- Time-sharing field cycles on Line 2 (T02-36).
- Handoff blinking and pointout states (T02-37).
- Multi-facility inter-TRACON automated coordination lists.

## Implementation notes

- Update `src/scope/datablock.ts`, `src/scope/trackDisplay.ts`, `src/scope/renderScope.ts`, `src/scope/scopeKeys.ts`.
- Add test coverage in `src/scope/datablock.test.ts`, `src/scope/scopeKeys.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** LDB renders both assigned squawk code and Mode C altitude (e.g. `1200 045`).
- [ ] **AC2 —** Clicking an unassociated target temporarily reveals ground speed in the LDB.
- [ ] **AC3 —** Associated tracks owned by another controller render as PDB (Line 2 only) by default.
- [ ] **AC4 —** Clicking an unowned track toggles between PDB and Green FDB.
- [ ] **AC5 —** `F1` key activates momentary beacon code readout and forces PDBs to FDBs.
- [ ] **AC6 —** BRITE channel `ldb` controls brightness of both LDB and PDB blocks.

## Test plan

- Unit tests for `formatLimitedDatablock` (with squawk & queried speed) and `formatPartialDatablock`.
- Unit tests for click-to-query and click-to-toggle PDB/FDB transitions.
- Unit tests for F1 beaconator readout mode.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
