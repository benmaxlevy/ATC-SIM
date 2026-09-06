# T02-106: Video Map Lists (ML) Active Indicators & Interactive Scope Toggling

**Phase:** 2 Scope — STARS System Lists Architecture  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-103  
**Files:**
- `src/scope/coordinationList.ts`
- `src/scope/systemLists.ts`
- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/ui/canvas/ScopeCanvas.tsx`
- `src/ui/shell.tsx`
- `src/scope/test/coordinationList.test.ts`
- `src/scope/test/systemLists.test.ts`

---

## Context & Purpose

The Video Maps List (`ML`) provides an interactive on-screen directory of adapted vector map layers on the PPI. In STARS:
- Two directory modes are supported:
  1. `GEO MAPS` (`VIDEO MAPS`): All adapted facility map layers.
  2. `CURRENT` (`ACTIVE MAPS`): Layers currently enabled.
- Active maps in the `VIDEO MAPS` directory render a **`>`** followed by a space to the left of the map identifier/name. Inactive maps render spaces.
- Left-clicking any map name directly inside the list toggles that video layer ON/OFF immediately without opening DCB menus.
- Supported commands include `*ML Enter`, `MAP [Map ID#] Enter`, and DCB `MAPS -> CLR ALL` (`MAP ALL OFF`).

---

## Acceptance Criteria

1. **Geographic Maps Directory (`GEO MAPS` / `VIDEO MAPS`):**
   - Format:
     ```text
     VIDEO MAPS
     >  1 BOS AIRSPACE
        2 FINAL 4R/4L
        3 FINAL 22L/27
     >  4 MVA SECTORS
        5 VFR REPORTING
     ```
   - Header: `VIDEO MAPS`.
   - Active Indicator: Active maps have `> ` (a `>` caret followed by a space) to the left of the map ID/name. Inactive maps display two blank spaces in that column.
   - Column 1: Numerical index of the map (1–30, matching DCB toggle slots).
   - Column 2: Descriptive map layer name (e.g. `BOS AIRSPACE`, `FINAL 4R/4L`, `MVA SECTORS`).
2. **Active Displayed Maps Directory (`CURRENT` / `ACTIVE MAPS`):**
   - Format:
     ```text
     ACTIVE MAPS
      1 BOS AIRSPACE
      4 MVA SECTORS
     ```
   - Header: `ACTIVE MAPS`.
   - Displays only layers that are currently enabled on the scope.
3. **Interactive Scope Canvas Layer Toggling:**
   - Left-clicking directly on any map row in the on-screen list toggles that video map layer ON or OFF.
   - When toggled ON, the row gains the `> ` active indicator and the video map renders on the scope.
   - When toggled OFF, the `> ` indicator clears and the map layer unmounts.
4. **Commands:**
   - `*ML Enter` or DCB `MAPS -> GEO MAPS`: Toggles the `VIDEO MAPS` directory on/off.
   - DCB `MAPS -> CURRENT`: Toggles the `ACTIVE MAPS` list on/off.
   - `*ML [Click] Enter`: Repositions the map list anchor.
   - `*ML D Enter`: Resets the map list to adaptation default.
   - `MAP [Map ID#] Enter` (e.g. `MAP4 Enter`): Directly toggles the specified map layer.
   - DCB `MAPS -> CLR ALL` (or `MAP ALL OFF`): Disables all active map layers.
