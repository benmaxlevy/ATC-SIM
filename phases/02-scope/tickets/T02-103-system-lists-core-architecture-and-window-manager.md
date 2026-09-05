# T02-103: STARS System Lists Core Architecture, Drag/Reset Engine & DCB PREF Persistence

**Phase:** 2 Scope — STARS System Lists Architecture  
**Priority:** P0  
**Size:** M  
**Depends on:** none  
**Files:**
- `src/scope/systemLists.ts`
- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/dcb/dcbPref.ts`
- `src/ui/canvas/ScopeCanvas.tsx`
- `src/ui/shell.tsx`
- `src/scope/test/systemLists.test.ts`
- `src/scope/test/systemListsAndDcb.integration.test.ts`

---

## Context & Purpose

In authentic FAA STARS displays (R07) and CRC terminal radar workstations, on-screen system lists share common operational characteristics:
- Standard list IDs: `FL` (Flight Plan), `TL` (Tower), `VL` (VFR), `ML` (Video Maps), `AL` (LA/CA/MCI Status Box), alongside `SSA` (System Status Area).
- Adaptation default anchor coordinates `(defaultX, defaultY)` and capacity `maxLines`.
- Repositioning via keyboard: `*` + `[List ID]` + `[Left-Click New Location]` + `Enter`.
- Reset to adaptation default: `Shift` + Left-Click on the title header, or `*` + `[List ID]` + `D` + `Enter`.
- Direct window dragging: Holding left-click or middle-click on the list title header and dragging.
- Appearance: Text size scales with DCB `CHAR SIZE -> LISTS` spinner (`view.charSizes.lists`) and brightness with `BRITE -> LST` spinner (`view.brite.lst`).
- State Persistence: Active list visibility, coordinates, and capacities persist into workstation profiles via DCB `PREF`.

This ticket establishes the core system lists registry, default anchors, drag/reset interaction engine, and DCB PREF persistence.

---

## Acceptance Criteria

1. **Standard List ID Registry & Adaptation Defaults:**
   - Formalize standard list IDs in `DEFAULT_SYSTEM_LIST_PLACEMENTS`:
     - `FL`: `(0.02, 0.40)`, maxLines: 10, title: `FLIGHT PLAN`
     - `TL`: `(0.75, 0.02)`, maxLines: 10, title: `[AIRPORT] TOWER`
     - `VL`: `(0.02, 0.70)`, maxLines: 10, title: `VFR LIST`
     - `ML`: `(0.25, 0.02)`, maxLines: 20, title: `VIDEO MAPS`
     - `AL`: `(0.75, 0.70)`, maxLines: 50, title: `LA/CA/MCI`
     - `SSA`: `(0.02, 0.02)`, maxLines: 15, title: `SYSTEM STATUS AREA`
   - Store immutable adaptation default positions `(defaultX, defaultY)` for every list.
   - Maintain backwards compatibility aliases (`TAB`/`T`, `TV`, `TM`, `TX`, `P1`–`P3`) so existing tests continue to pass.
2. **Keyboard Relocation & Staging Lifecycle:**
   - Typing `*` + `[List ID]` arms list relocation.
   - Left-clicking the scope canvas stages candidate normalized coordinates `(stagedX, stagedY)` without immediately mutating the live placement, rendering a dashed ghost frame.
   - Pressing `Enter` commits the staged position to `view.systemLists[id]` and clears preview.
   - If `Enter` is pressed without clicking, toggles visibility as standard.
3. **Direct Title Dragging & Default Reset:**
   - Holding Left-Click or Middle-Click on the title header of any visible system list starts dragging.
   - Renders a green anchor outline at the start position and a white moving outline following the pointer.
   - Releasing the mouse commits the new coordinates. `Escape` cancels and restores original position.
   - Shift-Left-Clicking directly on the list title header resets that list to its adaptation default coordinates.
   - Typing `*` + `[List ID]` + `D` + `Enter` (e.g. `*FLD Enter`, `*TLD Enter`, `*MLD Enter`) resets the list to default anchor.
4. **DCB PREF Persistence:**
   - Extend `DcbPrefBody` in `src/scope/dcb/dcbPref.ts` to include `systemLists`:
     ```typescript
     systemLists: Record<string, { visible: boolean; x: number; y: number; maxLines: number }>;
     ```
   - Saving a preference profile (DCB PREF `SAVE` / `SAVE AS`) persists active `systemLists` state.
   - Recalling a preference slot restores list visibility, coordinates, and capacities to `ScopeView.systemLists`.
   - Maintain schema backward-compatibility for existing v1/v2/v3 PREF snapshots without `systemLists`.
5. **Appearance Integration:**
   - All list rendering respects `view.charSizes.lists` (font size and line height) and `view.brite.lst` (color brightness).
   - Overlap collision detection renders green warning frames around colliding active list rectangles when not actively dragging.
