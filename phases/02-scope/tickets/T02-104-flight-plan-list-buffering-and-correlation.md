# T02-104: Flight Plan List (FL) Buffering, Correlation & Pagination

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
- `src/scope/test/systemListsAndDcb.integration.test.ts`

---

## Context & Purpose

The Flight Plan List (`FL`) buffers pending, proposed, or unassociated departures and arrivals entering the terminal area before automated target correlation occurs. In STARS:
- An uncorrelated radar or ADS-B target squawking the assigned discrete beacon code automatically associates with the pending flight plan when callsigns/squawks match, generating a Full Data Block (FDB) on the radar map and purging the entry from this list.
- Controllers can directly associate a flight plan to an uncorrelated track by typing the quick-action index and clicking the target (`[Index#] [Left-Click Radar Target]`).
- Entries can be manually dropped via `*DEL [Index#] Enter` or by pressing `F1` and clicking the list row.
- Pagination is displayed via `MORE: X/Y` and navigated using `Page Down` / `Page Up` or by clicking the `MORE: X/Y` header.

---

## Acceptance Criteria

1. **Flight Plan Buffer Data Feed:**
   - Populates `FL` with pending/proposed departures (`world.scheduledDepartures` not yet airborne/correlated) and unassociated tracks (`td.unassociated === true`).
   - Correlated owned/tracked aircraft are excluded from `FL`.
2. **Text Formatting & Pagination Header:**
   - Format:
     ```text
     FLIGHT PLAN
     MORE: 6/12
      1 AAL123  7022
      2 AAL456  6412
      4 DAL623  2374
      9 DAL660  2374
     11 JBU301  4611
      0 JBU393  1660
     ```
   - Header: `FLIGHT PLAN`.
   - Pagination header: `MORE: X/Y` appears when total queued entries exceed `maxLines`, where `X` is visible count and `Y` is total queue.
   - Column 1: Index / Quick-Action Number (1–2 digits, right-aligned or zero-padded).
   - Column 2: Callsign (up to 7 characters).
   - Column 3: Assigned 4-digit discrete Mode 3/A beacon squawk.
3. **Automated Correlation & Purge:**
   - When an uncorrelated target squawks the assigned discrete beacon code matching a pending plan, it automatically correlates:
     - The target data block upgrades to Full Data Block (FDB).
     - The corresponding entry is immediately purged from `FL`.
4. **Commands & Interactive Controls:**
   - Toggle Visibility: `*FL Enter` (or dedicated `FPL` key) toggles `FL` on/off.
   - Set Visible Capacity: `*FL [Number] Enter` (e.g. `*FL10 Enter`) adjusts `maxLines` (clamped to 1–100).
   - Pagination Scroll: Pressing `Page Down` / `Page Up` or clicking `MORE: X/Y` scrolls the visible window.
   - Direct Track Association: Typing `[Index#]` and left-clicking an uncorrelated radar target associates the flight plan with that track.
   - Deletion: Typing `*DEL [Index#] Enter` or pressing `F1` and left-clicking the list row removes the flight plan from the queue.
