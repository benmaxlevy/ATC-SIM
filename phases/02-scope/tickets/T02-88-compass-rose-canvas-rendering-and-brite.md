# T02-88 Compass Rose Canvas Rendering and BRITE CMP Integration

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-87
**Blocks:** T02-89
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Render the STARS Compass Rose overlay onto the radar scope canvas via `drawMapLayers` in `renderScopePaint.ts`, modulating its stroke and label brightness with `BRITE CMP`, sizing its labels with `CHAR SIZE TOOLS`, and supporting PREF profile persistence.

## Context

- In STARS TCW:
  - Compass rose ticks and ring are stroked with `applyBrite(PALETTE.mapDim, view.brite.cmp)`.
  - Compass rose heading labels are rendered using the `TOOLS` character size font (`datablockFontCss(view.charSizes.tools)`), also modulated by `applyBrite(PALETTE.mapDim, view.brite.cmp)`.
  - Adjusting the `CMP` spinner on the `BRITE` submenu immediately adjusts the visibility and brightness of the compass rose ticks and heading numbers.
  - Toggling range rings or compass rose visibility hides/shows the overlay.

## Scope

- **`src/scope/render/renderScopePaint.ts`**:
  - In `drawMapLayers`:
    - Calculate `cmpColor = applyBrite(PALETTE.mapDim, view.brite.cmp)`.
    - Stroke compass rose ring and radial tick paths with `cmpColor` and `RING_STROKE_PX`.
    - Draw heading labels (`360`, `030`, `060`, `090`, ...) centered at their computed screen coordinates using `ctx.font = datablockFontCss(view.charSizes.tools)`.
- **`src/scope/dcb/dcbPref.ts`**:
  - Ensure `showCompassRose` and `brite.cmp` are saved and restored cleanly in DCB PREF slot profiles.
- **`src/scope/dcb/dcbFunctions.ts`**:
  - Ensure `stepBriteChannel` with `"cmp"` triggers `invalidateMapCache(view)`.

## Out of scope

- Direct user interaction / click handling on the compass rose (compass rose is purely a visual display overlay).
- Final end-to-end integration acceptance (handled in T02-89).

## Acceptance criteria

- [ ] **AC1 —** Compass rose ring and 72 radial tick marks render on the scope canvas with `PALETTE.mapDim` modulated by `BRITE CMP`.
- [ ] **AC2 —** Heading labels (`360`..`330`) render in `TOOLS` character font size modulated by `BRITE CMP`.
- [ ] **AC3 —** When `BRITE CMP` is set to `0` / `OFF`, compass rose ticks and labels are dimmed to 0.
- [ ] **AC4 —** `showCompassRose` setting round-trips cleanly through PREF save and restore.
- [ ] **AC5 —** Zero regressions across existing video maps, runways, localizers, and range rings.

## Test plan

- Render: `src/scope/render/test/renderScope.test.ts` (test canvas stroke and text calls for compass rose).
- Unit: `src/scope/dcb/test/dcbPref.test.ts` (verify PREF serialization of compass rose state).
