# T02-56 Flight Plan (TAB), VFR, Tower, Alert, and Coast/Suspend Lists

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-55
**Blocks:** T02-57, T02-60
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the primary operational STARS in-scope system lists (Flight Plan / TAB, VFR, Tower arrival sequences, Alert list, and Coast/Suspend), matching Vice `stars/lists.go` and CRC STARS specifications: full data feed integration from `World`, live keyboard toggles (`[MULTIFUNC] T`, `TV`, `P#`, `TM`, `TC`), and automatic line formatting.

## Context

In Vice and real STARS, controllers manage inbound flows and pending departures through dedicated on-scope lists rather than external UI panels. Unassociated flights appear in the TAB list, VFR flights with discrete beacons in the VFR list, sequenced arrivals with distance in Tower lists, low altitude (MSAW) and collision alerts (CA) in the Alert list, and suspended tracks in the Coast/Suspend list.

## Research

- **Analog:** CRC STARS System Lists / Vice `stars/lists.go` (`drawTABList`, `drawVFRList`, `drawTowerList`, `drawAlertList`, `drawCoastList`, `cmdops.go`).
- **Glossary:** TAB List (Flight Plan List), VFR List, Tower List, Alert List, Coast/Suspend List.
- **Trainer delta:** Populated from local `World` state and `Aircraft` collections; no external host connection needed.

## Scope

- Implement **Flight Plan List (TAB List)**:
  - Toggle visibility: `[MULTIFUNC]T`, position: `[MULTIFUNC]T[SLEW]`, line count: `[MULTIFUNC]T(##)`.
  - Format: `[INDEX] [ACID] [BEACON] [REQ_ALT] [DEP_EXIT_FIX/ENTRY_FIX]`.
  - Show unassociated departure and arrival flight plans matching the controller's active TCP.
- Implement **VFR List**:
  - Toggle visibility: `[MULTIFUNC]TV`, position: `[MULTIFUNC]TV[SLEW]`, line count: `[MULTIFUNC]TV(##)`.
  - Format: `[INDEX] [ACID] [BEACON]`. Displays `"VFR "` before discrete beacon code assignment.
- Implement **Tower Arrival Lists (1, 2, 3)**:
  - Toggle visibility: `[MULTIFUNC]P(#)`, position: `[MULTIFUNC]P(#)[SLEW]`, line count: `[MULTIFUNC]P(#)(##)`.
  - Filter active arrivals for adapted airports (e.g. KDEM RW27/RW09), sorted in real time by distance to runway threshold.
  - Format: `[INDEX] [ACID] [ACTYPE] [GROUNDSPEED/BEACON] [DIST_NM]`.
- Implement **Alert List**:
  - Position: `[MULTIFUNC]TM[SLEW]`.
  - Displays active MSAW alerts (`LA [ACID] [ALT_HUNDREDS]`) and Conflict Alerts (`CA [ACID1] [ACID2]`).
  - Auto-appears when active alerts exist; disappears when cleared. Max 50 lines.
- Implement **Coast / Suspend List**:
  - Position: `[MULTIFUNC]TC[SLEW]`, line count: `[MULTIFUNC]TC(##)`.
  - Displays tracks with suspended flight plans (`[TRK SUSP]`).

## Out of scope

- Coordination / hold-for-release lists (owned by T02-57).
- Video maps directory list (owned by T02-57).
- DCB toolbar changes (owned by T02-58 and T02-59).

## Implementation notes

- Connect lists to `world.aircraft` and `world.alerts` via selectors in `src/scope/systemLists.ts`.
- Ensure sorting of Tower arrival list updates reactively on each simulation clock tick.
- Coordinate keyboard commands through `src/scope/scopeKeys.ts` and `src/scope/previewArea.ts`.

## Acceptance criteria

- [ ] **AC1 —** TAB Flight Plan list renders unassociated flight plans with index, ACID, beacon, altitude, and exit/entry fixes.
- [ ] **AC2 —** VFR list renders active VFR flights with tab index, callsign, and beacon code.
- [ ] **AC3 —** Tower list displays sequenced arrivals sorted by distance to threshold with dynamic nautical mile distance readout.
- [ ] **AC4 —** Alert list automatically displays active MSAW (`LA`) and Collision Alerts (`CA`) and clears when resolved.
- [ ] **AC5 —** Coast/Suspend list tracks suspended flight plans.
- [ ] **AC6 —** Keyboard commands `[MULTIFUNC] T`, `TV`, `P#`, `TM`, `TC` toggle, position, and resize lists.
- [ ] **AC7 —** Automated tests cover data population, sorting, filtering, and keyboard dispatch.

## Test plan

- Unit: `src/scope/systemLists.operational.test.ts` (TAB, VFR, Tower, Alert, Coast list formatters and selectors).
- Integration: `src/scope/systemLists.integration.test.ts` (live `World` ticks, spawning flights, alert triggers).

## Suggested files

- `src/scope/systemLists.ts`
- `src/scope/listFormatter.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.ts`
- `src/scope/systemLists.operational.test.ts`
