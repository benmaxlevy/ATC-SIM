# T02-105: Tower List (TL) & VFR List (VL) Sequences and Drop Interactions

**Phase:** 2 Scope — STARS System Lists Architecture  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-103  
**Files:**
- `src/scope/systemLists.ts`
- `src/scope/listFormatter.ts`
- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/ppi.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/test/systemLists.operational.test.ts`

---

## Context & Purpose

This ticket implements the **Tower / Departure List (`TL`)** and **VFR List (`VL`)**:
- **Tower List (`TL`)**: Maintains electronic coordination between TRACON radar positions and designated airport tower cabs (e.g. `BOS TOWER`, `BED TOWER`). Populates as aircraft stage for departure or hand off to tower; clears upon handoff completion, departure roll-out, or manual track drop.
- **VFR List (`VL`)**: Tracks untracked or advisory VFR aircraft receiving basic radar traffic advisories or squawking conspicuity codes (1200 or assigned discrete codes) within terminal airspace. Segregates non-participating flights from IFR queues while displaying squawk and altitude.
- Both lists support manual entry dropping via `F1` + left-clicking the entry row.

---

## Acceptance Criteria

1. **Tower List (`TL`) Formatting & Lifecycle:**
   - Format:
     ```text
     BOS TOWER
     AAL100   CRJ7
     AAL506   A319
     DAL628   B736
     AAL924   E145
     EDV461   CRJ2
     ```
   - Header: Local tower cab identifier (e.g. `BOS TOWER`, `BED TOWER`).
   - Column 1: Active aircraft callsign.
   - Column 2: ICAO/FAA aircraft type designator.
   - Entries dynamically populate when aircraft are staged for departure or handed off to tower, and clear on handoff completion, departure roll-out, or manual drop.
2. **Tower List Commands:**
   - `*TL Enter`: Toggles primary tower list.
   - `*TL [Tower ID] Enter` (e.g. `*TLBED Enter`): Toggles specific satellite tower list.
   - `*TL [Click] Enter` / `*TL D Enter`: Repositions / resets tower list anchor.
   - `F1` then left-click list entry: Manually drops that entry from the tower list.
3. **VFR List (`VL`) Formatting & Fields:**
   - Format:
     ```text
     VFR LIST
     N12345  1200  045
     N982B   4215  025
     ```
   - Header: `VFR LIST`.
   - Column 1: Aircraft callsign or registration tail number.
   - Column 2: 4-digit beacon code (`1200` or assigned discrete code).
   - Column 3: Mode C pressure altitude in hundreds of feet (`045` = 4,500 ft).
4. **VFR List Commands:**
   - `*VL Enter` (or dedicated `VFR` key): Toggles VFR list visibility.
   - `*VL [Click] Enter` / `*VL D Enter`: Repositions / resets VFR list anchor.
   - `[Index#] [Left-Click Radar Target]`: Promotes / associates VFR entry to a radar target.
   - `F1` then left-click list entry: Drops entry from the VFR list.
