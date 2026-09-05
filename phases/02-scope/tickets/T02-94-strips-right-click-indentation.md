# T02-94 Flight Progress Strips Right-Click Indentation and Cocking State

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-93
**Blocks:** T02-95
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Enable controllers to indent ("cock") flight progress strips by right-clicking once on a strip, visually offsetting it horizontally within its rack to denote pending actions or non-standard clearances, with subsequent right-clicks toggling between indented and normal states.

## Context

Virtual and physical ATC tower/TRACON positions organize flight progress strips in bays. Controllers frequently slide or "cock" a strip horizontally by ~1 inch (24–32px) to visually separate pending clearances, active runways, or aircraft requiring immediate attention from the rest of the sequence (FAA Order 7110.65 Chapter 2 §3; vNAS / vStrips).

In the web interface:
- A single right-click on any strip card must intercept the native browser `contextmenu` event, prevent the default browser context menu (`e.preventDefault()`), and toggle the strip's indented state.
- Indented strips slide horizontally to the right within their rack column, maintaining their data fields and readability.
- Keyboard navigation must also support toggling indentation (e.g. `Shift+Enter` or ContextMenu key) for accessibility.

## Scope

- **`src/ui/strips/types.ts`**:
  - Add optional `indented?: boolean;` property to `BaseStripData`.
- **`src/ui/strips/DepartureStrip.tsx` & `src/ui/strips/ArrivalStrip.tsx`**:
  - Add props:
    - `indented?: boolean;`
    - `onToggleIndent?: (stripId: string) => void;`
  - Bind `onContextMenu` handler:
    - Calls `e.preventDefault()`.
    - Calls `onToggleIndent?.(strip.id)`.
  - Handle keyboard shortcut in `onKeyDown`:
    - Toggles indent when `e.shiftKey && (e.key === "Enter" || e.key === " ")`.
  - Apply `strip-indented` class to the outer `.strip` element when `indented` is true.
  - Ensure left-click selection (`onSelect`) is not interfered with by right-click.
- **`src/ui/strips/strips.css`**:
  - Add `.strip.strip-indented` and `.strip-indented`:
    - `transform: translateX(28px);` (or `margin-left: 28px; width: calc(100% - 28px);`).
    - Smooth transition: `transition: transform 0.15s ease, margin-left 0.15s ease;`.
    - High-contrast visual cues fitting the dark cab environment (`#1a1e24`).
- **`src/ui/strips/StripsBoard.tsx`**:
  - Manage `indentedStripIds: Set<string>` internal state (with support for optional controlled props `indentedStripIds?: Set<string>` / `onToggleIndent?: (stripId: string, indented: boolean) => void`).
  - Provide `handleToggleIndent(stripId: string)`:
    - Toggles presence in `indentedStripIds`.
    - Calls `onToggleIndent?.(stripId, nextIndented)`.
  - Pass `indented={indentedStripIds.has(strip.id)}` and `onToggleIndent={handleToggleIndent}` to `DepartureStrip` and `ArrivalStrip`.
- **Unit Tests**:
  - In `src/ui/strips/test/stripComponents.test.tsx`:
    - Right-click fires `onContextMenu`, invokes `preventDefault`, and triggers `onToggleIndent`.
    - Strip renders `.strip-indented` class when `indented={true}`.
    - Keyboard shortcut toggles indent.
  - In `src/ui/strips/test/stripsBoard.test.tsx`:
    - Right-clicking a departure strip indents it.
    - Right-clicking again unindents it.
    - Indentation state is tracked independently per strip across both departures and arrivals.

## Out of scope

- Strip reordering or drag-and-drop mechanics (handled in T02-95).
- Canvas freehand pen/stylus markings on strips.
- Strip deletion or archiving.

## Acceptance criteria

- [x] **AC1 —** Right-clicking once on a departure or arrival strip intercepts `contextmenu`, calls `e.preventDefault()`, and indents the strip.
- [x] **AC2 —** Right-clicking an already-indented strip toggles it back to unindented.
- [x] **AC3 —** Indented strips apply `.strip-indented` CSS styling with a horizontal offset (~28px) inside the rack list.
- [x] **AC4 —** Left-clicking an indented strip selects the strip and updates `World.selectedAircraftId` without resetting or toggling the indent.
- [x] **AC5 —** Keyboard accessibility supports toggling indent on focused strips via `Shift+Enter`.
- [x] **AC6 —** Unit tests in `stripComponents.test.tsx` and `stripsBoard.test.tsx` pass 100%.

## Test plan

- Run `npm test src/ui/strips/test/stripComponents.test.tsx`.
- Run `npm test src/ui/strips/test/stripsBoard.test.tsx`.
