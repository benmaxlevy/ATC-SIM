# T02-66 STARS Tracking, Handoff & Data Block Key Chords

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-61
**Blocks:** T02-67
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align all target tracking, handoff acceptance, pointout acknowledgment, and datablock interaction commands to strict FAA STARS / CRC keyboard standards: `+` `<SLEW>` (initiate track), `+ [Callsign] <ENTER> <SLEW>` (associate track by callsign), `/` `<SLEW>` (drop track), `<ENTER> <SLEW>` (accept incoming handoff), `*` `<SLEW>` (acknowledge point out / highlight data block), `/` `[Click Data Block]` (toggle PDB ↔ FDB), `* [1-8] [Click Data Block]` (set leader line direction), `* 0 [Click Data Block]` (reset leader direction to default), and `* B <SLEW>` (read out Mode 3/A beacon code).

## Context

In real FAA STARS consoles (R07 Tables 18, 19, 20, and 30), the dedicated `<TRK>` (`+`), `<ENTER>` (`Enter`), `<SLEW>` (`/` or direct click), and `<MULTI>` (`*`) keys control target lifecycle and data block presentation without requiring mouse menu navigation.

## Research

- **Analog:** CRC STARS Command Reference Tables 18, 19, 20, 30 (docs.virtualnas.net/crc/stars — R07).
  - `+ <SLEW>`: Initiate track on clicked target (`INIT CNTL`).
  - `+ [Callsign] <ENTER> <SLEW>`: Manually associate flight plan to target.
  - `/ <SLEW>`: Drop track on clicked target (`TERM CNTL`).
  - `<ENTER> <SLEW>`: Accept incoming handoff.
  - `* <SLEW>`: Acknowledge / accept incoming point out or highlight data block.
  - `/ [Click Data Block]`: Toggle between Partial Data Block (PDB) and Full Data Block (FDB).
  - `* [1-8] [Click Data Block]`: Set leader line direction (1 = NE clockwise through 8).
  - `* 0 [Click Data Block]`: Reset leader line to facility default direction.
  - `* B <SLEW>`: Read out Mode 3/A beacon code on uncorrelated target.
- **Glossary:** Track Key (`+`), Slew/Drop Key (`/`), Handoff Accept, Leader Line Direction, Beaconator.
- **Trainer delta:** Interacts with `src/scope/trackDisplay.ts`, `src/scope/ownership.ts`, `src/scope/pointout.ts`, `src/scope/leader.ts`, and `src/scope/starsChord.ts`.

## Scope

- Expand `handleScopeKeyDown` and `handlePpiCanvasClick` to support standard STARS tracking keys:
  - `+` with scope focus: arm track initiation mode (display `INIT CNTL` in preview readout); subsequent click on uncorrelated target initiates track.
  - `+ [Callsign] <Enter>`: arm associate mode with FLID; subsequent click on target associates that callsign.
  - `/` with scope focus: arm track drop mode (display `TERM CNTL` in preview readout); subsequent click on owned target drops track.
  - `<Enter>` with scope focus: arm handoff accept mode; subsequent click on inbound handoff target accepts ownership.
  - `*` with scope focus: arm pointout/highlight mode; subsequent click acknowledges pointout or toggles cyan highlight.
  - Direct `/` click on a datablock toggles between PDB and FDB.
  - `* [1-8]` click on datablock sets leader direction (1=NE clockwise to 8); `* 0` resets to facility default.
  - `* B` click on unassociated target displays raw 4-digit beacon code for 5 seconds.
- Retain existing `F3` (INIT CNTL) and `F4` (TERM CNTL) mappings for backwards compatibility.
- Ensure all armed tracking chords cancel cleanly on `<Escape>`.

## Out of scope

- Multi-controller inter-facility TCP handoffs (owned by backlog).
- Scratchpad editing commands (owned by backlog).
- Assigned altitude/heading/speed datablock modifications (owned by backlog).

## Acceptance criteria

- [ ] **AC1 —** `+` followed by clicking a target initiates track; `+ [Callsign] <Enter>` associates the flight plan.
- [ ] **AC2 —** `/` followed by clicking an owned target drops track.
- [ ] **AC3 —** `<Enter>` followed by clicking an inbound blinking target accepts handoff.
- [ ] **AC4 —** `*` followed by clicking a target acks pointout or toggles cyan highlight.
- [ ] **AC5 —** `/` clicking a datablock toggles PDB ↔ FDB; `* [1-8]` sets leader direction; `* 0` resets leader direction.
- [ ] **AC6 —** `* B` clicking an uncorrelated target displays beacon code.
- [ ] **AC7 —** Automated unit and integration tests prove key chords, slew clicks, and datablock updates.

## Test plan

- Unit: `src/scope/previewArea.test.ts` / `src/scope/starsChord.test.ts` (tracking and datablock chord parsing).
- Integration: `src/scope/scopeKeys.test.ts` / `src/scope/starsFidelity.integration.test.ts` (click actions, handoff acceptance, leader updates).

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/ppi.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/ownership.ts`
- `src/scope/leader.ts`
