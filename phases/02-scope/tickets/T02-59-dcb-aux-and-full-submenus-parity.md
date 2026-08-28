# T02-59 DCB AUX & Full Submenus Parity (BRITE 16-Channel, PREF 32-Slot, SSA 22-Filter)

**Phase:** 02 Scope
**Priority:** P0
**Size:** L
**Depends on:** T02-58
**Blocks:** T02-60
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Bring the AUX DCB and all DCB submenus into complete 1:1 functional and visual alignment with Vice `stars/dcb.go`: AUX toolbar (`H_RATE`, `CURSOR HOME`, `DWELL`, expanded 0–10 history), BRITE submenu (full 16-channel $12 \times 2$ grid), PREF submenu (32-slot profile grid with active illumination), SSA FILTER submenu (22 filter flags with master `ALL` toggle), and SITE / MAPS category filter menus.

## Context

Vice implements complete fidelity for all STARS auxiliary controls and configuration submenus. This ticket completes all remaining DCB submenus so every channel, profile, and filter operates authentically.

## Research

- **Analog:** CRC STARS DCB Submenus / Vice `stars/dcb.go` (`drawAuxDCB`, `drawBriteMenu`, `drawPrefMenu`, `drawSSAFilter`, `drawSiteMenu`, `drawMapsMenu`).
- **Glossary:** AUX DCB, Brightness Channels (16), Dwell Mode (`OFF`/`ON`/`LOCK`), History Rate (`H_RATE`), Preference Set Profiles (32 slots), SSA Filter (22 flags).
- **Trainer delta:** Canvas brightness multipliers hooked into `src/scope/palette.ts` and `src/scope/renderScope.ts`.

## Scope

- **AUX DCB Completion**:
  - `VOL`: Volume spinner (0–100, plays test beep on change).
  - `HISTORY`: Spinner 0–10 dots (expanded from 5).
  - `H_RATE`: History scan rate spinner (seconds interval).
  - `CURSOR HOME`: Toggle button (echoes `"HOME"` / `"NO HOME"` to preview area).
  - Spacer caps: `CSR SPD 4`, `MAP UNCOR`, `UNCOR`, `BEACON MODE-2`, `RTQC`, `MCP`.
  - `DCB TOP/LEFT/RIGHT/BOTTOM`: Dock edge selectors.
  - `PTL LNTH` (0.5–3.0 min), `PTL OWN`, `PTL ALL`.
  - `DWELL`: Dwell mode spinner (`OFF`, `ON`, `LOCK`).
  - `TPA/ATPA`: Enters TPA/ATPA submenu.
  - `SHIFT`: Swaps back to MAIN.
- **BRITE Submenu (12 columns $\times$ 2 rows = 24 slots, 16 live channels)**:
  - Slots: `DCB`/`BKC`, `MPA`/`MPB`, `FDB`/`LST`, `POS`/`LDB`, `OTH`/`TLS`, `RR`/`CMP`, `BCN`/`PRI`, `HST`/`WX`, `WXC`/`TPA`, `ATPA`/`AMZ`(disabled), `RWY`/`NTZ`(disabled), `REF`/`DONE`.
  - Wire all 16 brightness levels into canvas drawing passes (`renderScope.ts`).
- **PREF Submenu (16 columns $\times$ 2 rows = 32 slots)**:
  - 32 saved profile slots displaying `<Slot #>\n<Name>` (e.g. `1\nFINAL`).
  - Active profile highlights with `buttonSelected` amber outline.
  - Controls: `DEFAULT`, `RESTORE`, `SAVE`, `SAVE AS` (prompts name via preview area), `DELETE`, `DONE`.
- **SSA FILTER Submenu (14 columns $\times$ 2 rows = 28 slots, 22 active filters)**:
  - Filters: `ALL`, `TIME`, `STATUS`, `PLAN`, `RADAR`, `SPC`, `RANGE`, `ALT FIL`, `INTRAIL`, `2.5`, `AIRPORT`, `WX HIST`, `QL`, `TW OFF`, `CON/CPL`, `OFF IND`, `CRDA`, `WX`, `ALTSTG`, `CODES`, `SYS OFF`, `PTL`, `DONE`.
  - Master `ALL` behavior: clicking `ALL` sets all true; clicking individual item disables `ALL` and toggles that item off.
- **MAPS & SITE Submenus**:
  - MAPS: Add category filters (`AIRPORT`, `RUNWAYS`, `SID STAR`, `SYS PROC`, `CONTROL`, `DANGER AREAS`).
  - SITE: Add site buttons for adapted radar sites + `FUSED` and `MULTI` mode toggles.

## Out of scope

- Scale-to-fit and scroll physics (owned by T02-60).

## Implementation notes

- Expand `BriteState` in `src/scope/palette.ts` to include all 16 channels with schema migration `v: 3`.
- Expand `DcbPrefSet` in `src/scope/dcbPref.ts` to support 32 slots.
- Ensure all 22 SSA filter flags correctly hide/show corresponding rows in `src/scope/ssa.ts`.

## Acceptance criteria

- [ ] **AC1 —** AUX DCB includes `H_RATE`, `CURSOR HOME`, `DWELL` (`OFF`/`ON`/`LOCK`), and 0–10 history dots.
- [ ] **AC2 —** BRITE submenu presents the full $12 \times 2$ grid with all 16 channels functioning on the PPI.
- [ ] **AC3 —** PREF submenu displays 32 profile slots with custom names and active slot highlight.
- [ ] **AC4 —** SSA FILTER submenu presents 22 filter flags with master `ALL` toggle logic.
- [ ] **AC5 —** MAPS category buttons filter in-scope map directory; SITE menu switches FUSED / MULTI radar modes.
- [ ] **AC6 —** Automated unit and integration tests cover all submenus, channel bindings, and preference persistence.

## Test plan

- Unit: `src/ui/DisplayControlBar.submenus.test.ts` (BRITE channels, 32 PREF slots, 22 SSA filters, DWELL spinner).
- Integration: `src/scope/dcbPref.test.ts` (profile serialization, schema migration).

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/dcbMenu.ts`
- `src/scope/dcbFunctions.ts`
- `src/scope/dcbPref.ts`
- `src/scope/palette.ts`
- `src/scope/ssa.ts`
- `src/ui/DisplayControlBar.submenus.test.ts`
