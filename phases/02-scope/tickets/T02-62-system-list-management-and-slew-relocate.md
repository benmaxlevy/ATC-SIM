# T02-62 STARS System List Management & Slew Relocation

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-61
**Blocks:** T02-67
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the complete suite of STARS List Management keyboard commands (Table 31 / 32) in the Preview Area, allowing controllers to toggle visibility, adjust maximum visible line count, and relocate in-scope system lists (`TAB`, `VFR`, `COAST`, `SIGN_ON`, `TOWER 1-3`, `ALERT`, `MAPS`, `CRDA`, `COORD`, and `SSA`) using keyboard entries and trackball/mouse slew clicks on the scope.

## Context

In real FAA STARS consoles (R07 Table 31), system lists are positioned, toggled, and sized using `<MULTI>` (`*`) list chords followed by `<ENTER>` or `<SLEW>` (radar canvas click). This provides rapid window management without breaking radar surveillance focus.

## Research

- **Analog:** CRC STARS Command Reference Table 31 / Table 32 (docs.virtualnas.net/crc/stars — R07).
  - `* T <ENTER>`: Toggle Flight Plan (TAB) list.
  - `* T <SLEW>`: Relocate TAB list anchor to clicked coordinates.
  - `* T [1-100] <ENTER>`: Set TAB list maximum visible lines.
  - `* TV <ENTER>` / `* TV <SLEW>` / `* TV [1-100] <ENTER>`: VFR list.
  - `* TC <ENTER>` / `* TC <SLEW>` / `* TC [1-100] <ENTER>`: Coast/Suspend list.
  - `* TS <ENTER>` / `* TS <SLEW>`: Sign-On list.
  - `* P1` / `* P2` / `* P3 <ENTER>` / `<SLEW>` / `[1-100] <ENTER>`: Tower Sequence lists 1–3.
  - `* TM <ENTER>` / `* TM <SLEW>`: LA/CA/MCI Alert list.
  - `* TX <ENTER>` / `* TX <SLEW>`: Video Maps directory list.
  - `* TN <ENTER>` / `* TN <SLEW>`: CRDA Status list.
  - `* S <SLEW>`: Relocate SSA anchor.
- **Glossary:** System List Window, Anchor Coordinates, Visible Line Limit, Slew Relocation.
- **Trainer delta:** Interacts directly with `view.systemLists` (`SystemListPlacement` records) and `toggleSystemList(view, listId)`.

## Scope

- Extend `PreviewArmedAction` with list management actions:
  - `{ type: "toggleList"; listId: string }`
  - `{ type: "resizeList"; listId: string; maxLines: number }`
  - `{ type: "armRelocateList"; listId: string }`
- Parse all standard list mnemonics (`*T`, `*TAB`, `*TV`, `*TC`, `*TS`, `*P1`, `*P2`, `*P3`, `*TM`, `*TX`, `*TN`, `*S`).
- On `<Enter>` commit:
  - If no numeric parameter: toggle visibility of the target list via `toggleSystemList(view, listId)`.
  - If numeric parameter `[1-100]`: clamp and update `view.systemLists[listId].maxLines`.
- On `<SLEW>` (radar canvas click):
  - If a list relocation command is armed (e.g. `* T` armed without Enter), calculate normalized $[x, y] \in [0, 1]$ from click coordinates and update the list's anchor position.
  - Disarm and return preview area to idle upon successful placement.
- Support `* S [Click]` to reposition the SSA anchor.
- Reject invalid line counts (e.g. `* T 0` or `* T 999`) with `<buffer> INV`.

## Out of scope

- Video map toggling commands (owned by T02-63).
- Scope center and range ring manipulation (owned by T02-64).
- Middle-click mouse drag/drop engine (already completed in T02-55).

## Acceptance criteria

- [ ] **AC1 —** `* T`, `* TV`, `* TC`, `* TS`, `* P1`–`* P3`, `* TM`, `* TX`, and `* TN` + `<Enter>` toggle their respective system lists on/off.
- [ ] **AC2 —** `* [List] [1-100] <Enter>` adjusts the `maxLines` capacity of the specified list.
- [ ] **AC3 —** Entering `* [List]` or `* S` and clicking on the radar canvas relocates the window anchor to the clicked position.
- [ ] **AC4 —** Invalid parameters or malformed list names flash `INV` and do not mutate state.
- [ ] **AC5 —** Automated unit and integration tests verify all list toggles, sizing, and click relocations.

## Test plan

- Unit: `src/scope/previewArea.test.ts` (list command parsing, resize parameters, arm relocation).
- Integration: `src/scope/systemLists.operational.test.ts` (list toggle execution, anchor relocation via canvas click).

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/systemLists.ts`
- `src/scope/ppi.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.test.ts`
