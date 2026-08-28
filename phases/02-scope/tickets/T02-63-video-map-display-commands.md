# T02-63 STARS Video Map Display Commands

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-61
**Blocks:** T02-67
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the complete STARS Video Map keyboard commands (Table 28 / Table 3) in the Preview Area buffer: `* D [ID]` (toggle map by catalog ID or DCB slot 1–32), `* D OFF [ID]` (turn off specific map), `* D ALL` (turn on all maps), and `* D NONE` (turn off all maps), keeping full synchronization with DCB MAPS buttons and `view.mapVisibility`.

## Context

In real FAA STARS consoles, video maps are selected and displayed using `<MULTI>D` map commands or direct map number entries. Controllers can toggle individual STARs, SIDs, approaches, or runway drawings on demand, or bulk-enable/disable all maps during configuration changes.

## Research

- **Analog:** CRC STARS Command Reference Table 28 Display Manipulation (docs.virtualnas.net/crc/stars — R07).
  - `* D [ID] <ENTER>`: Toggle / enable selected video map.
  - `* D OFF [ID] <ENTER>`: Disable selected video map.
  - `* D ALL <ENTER>`: Turn on all video maps.
  - `* D NONE <ENTER>`: Turn off all video maps.
  - Direct map ID syntax: `M [ID] <ENTER>` or `<MAPS>(###)<ENTER>`.
- **Glossary:** Video Map ID, DCB Slot Number, Catalog Map, Bulk Map Toggle.
- **Trainer delta:** Interacts with `LoadedVideoMap` catalog (`dcbCatalogMaps`), `toggleVideoMap(view, mapId)`, `clearAllVideoMaps(view)`, and `view.mapVisibility`.

## Scope

- Extend `PreviewArmedAction` with video map actions:
  - `{ type: "toggleVideoMap"; mapId: string; explicitState?: boolean }`
  - `{ type: "setAllVideoMaps"; enabled: boolean }`
- Implement map token resolution in `src/scope/dcbFunctions.ts`:
  - Match by numeric DCB slot (e.g. `1`–`32`).
  - Match by map catalog ID (case-insensitive, e.g. `RWY`, `LOC27`, `LOC09`, `DEM1_27`, `BAY1_27`).
- Parse map commands in `parsePreviewCommand`:
  - `* D [token] <Enter>` $\rightarrow$ toggles specified map.
  - `* D OFF [token] <Enter>` $\rightarrow$ turns off specified map.
  - `* D ALL <Enter>` $\rightarrow$ turns on all catalog maps.
  - `* D NONE <Enter>` $\rightarrow$ calls `clearAllVideoMaps(view)`.
  - `M [token] <Enter>` $\rightarrow$ shorthand toggle for specified map.
- Handle invalid map identifiers (unknown name or unpopulated slot) with `<buffer> INV`.
- Synchronize role flags (`showRunway`, `showLocalizer`, `showCoastline`) and invalidate map render cache upon changes.

## Out of scope

- Weather radar overlays (owned by backlog).
- System list directory windows (owned by T02-62).
- GeoJSON geometry parsing (already completed in T02-14).

## Acceptance criteria

- [ ] **AC1 —** `* D 1`, `* D LOC27`, and `M DEM1_27` + `<Enter>` toggle the visibility of the matching video map.
- [ ] **AC2 —** `* D OFF [token]` turns off the specified video map if enabled.
- [ ] **AC3 —** `* D ALL` turns on all catalog video maps; `* D NONE` turns off all video maps.
- [ ] **AC4 —** Invalid map IDs (e.g. `* D 99` or `* D XYZ`) trigger `... INV` rejection flash.
- [ ] **AC5 —** Automated tests prove map toggles by slot number, ID, bulk commands, and invalid input rejection.

## Test plan

- Unit: `src/scope/previewArea.test.ts` (map command token parsing, slot matching, error branches).
- Integration: `src/scope/dcbFunctions.test.ts` (map visibility state mutation, bulk enablement, cache invalidation).

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/dcbFunctions.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/dcbFunctions.test.ts`
