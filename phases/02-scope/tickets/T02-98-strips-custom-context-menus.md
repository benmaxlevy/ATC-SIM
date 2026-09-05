# T02-98 Strip Bay Custom Context Menus (Empty Space "Add Separator" & Separator "Delete")

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-97
**Blocks:** T02-99
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement custom context menus in `StripsBoard` that display on right-click over empty bay space (providing "Add Separator") and over separators (providing "Delete"), with native browser context menu suppression, auto-dismissal, and preservation of strip cocking on regular flight cards.

## Context

When working flight progress strip bays, controllers need quick, low-friction interactions to organize bays:
- Right-clicking empty space in a rack column (e.g. empty space in the strip list or rack background) intercepts the native browser context menu (`e.preventDefault()`) and presents a custom workstation menu option: **"Add Separator"**.
- Choosing "Add Separator" creates a new separator in that section, adds it to the rack's order, and automatically enters direct text-editing mode so the controller can immediately type the label.
- Right-clicking an existing separator card intercepts the native browser context menu and presents: **"Delete"** (or "Delete Separator") and optionally "Edit Text".
- Choosing "Delete" immediately removes the separator from the rack.
- Right-clicking a normal departure or arrival strip card continues to toggle strip indentation ("cocking") without showing this menu (as established in T02-94).
- The context menu closes automatically when an item is selected, when clicking outside the menu, or when pressing `Escape`.

## Research

- FAA 7110.65 Chapter 2 §3; vNAS / vStrips contextual interactions.
- Workstation context menu conventions: dark theme `#1a1e24` backdrop, `#333` border, green/yellow hover highlight, monospaced font, viewport bounding to prevent clipping off-screen.

## Scope

- **`src/ui/strips/StripsContextMenu.tsx`**:
  - Floating menu component rendered at cursor coordinates `(x, y)`.
  - Props:
    - `x: number`
    - `y: number`
    - `items: Array<{ label: string; action: () => void; danger?: boolean }>`
    - `onClose: () => void`
  - Viewport boundary detection (adjusts position if menu would overflow screen right or bottom).
  - Listens for outside clicks (`pointerdown` or `click`) and `Escape` keydown to close.
- **`src/ui/strips/StripsBoard.tsx`**:
  - Context menu state:
    ```ts
    interface ContextMenuState {
      visible: boolean;
      x: number;
      y: number;
      type: "empty-space" | "separator";
      section?: "departures" | "arrivals";
      separatorId?: string;
    }
    ```
  - Right-click handler on empty rack space:
    - Attached to `.rack-strip-list` and `.rack-empty`.
    - Detects when click target is not a strip or separator card.
    - Prevents default context menu.
    - Opens menu at `(e.clientX, e.clientY)` with item:
      - `Add Separator`: calls `handleAddSeparator(section)`.
  - Right-click handler on `StripSeparator`:
    - Passed down to `StripSeparator`.
    - Prevents default context menu.
    - Opens menu at `(e.clientX, e.clientY)` with items:
      - `Delete`: calls `handleDeleteSeparator(separator.id)`.
      - `Edit Text`: activates editing mode on that separator.
  - Action implementations:
    - `handleAddSeparator(section)`:
      - Generates unique ID (e.g. `sep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).
      - Adds new `StripSeparator` to separators collection with default empty label `""` (or `"SEPARATOR"`).
      - Inserts separator ID into section's rack order.
      - Sets active editing ID to the new separator so its input auto-focuses.
    - `handleDeleteSeparator(id)`:
      - Removes separator from collection and rack order.
      - Closes menu.
  - Verify that right-clicking flight strips still triggers `onToggleIndent` without opening the context menu.
- **`src/ui/strips/strips.css`**:
  - Style `.strips-context-menu`:
    - Fixed positioning with high `z-index` (e.g. `z-index: 1000`).
    - Dark cab background (`#161b22`), solid border (`#30363d`), subtle box shadow.
    - Monospace font (`IBM Plex Mono`, `Consolas`), uppercase typography.
  - Style `.strips-context-menu-item`:
    - Cursor pointer, padding `6px 12px`, color `#c9d1d9`.
    - Hover state: background `#21262d`, color `#ffff00`.
    - Danger item (`Delete`): hover color `#ff7b72`.
- **Unit Tests (`src/ui/strips/test/stripsContextMenu.test.tsx` and `stripsBoard.test.tsx`)**:
  - Right-clicking empty space in departures rack displays context menu with "Add Separator".
  - Right-clicking empty space in arrivals rack displays context menu with "Add Separator".
  - Clicking "Add Separator" creates a separator in that rack and activates editing.
  - Right-clicking a separator displays menu with "Delete".
  - Clicking "Delete" removes the separator from the rack.
  - Clicking outside or pressing Escape closes the context menu.
  - Right-clicking a flight strip still toggles indentation and does not show the separator context menu.

## Out of scope

- Global browser-wide context menu overrides outside the strip bay container.
- Nested multi-level submenu trees.

## Implementation notes

- When calculating click target for empty space, ignore events originating from inside `.strip`, `.departure-strip`, `.arrival-strip`, or `.strip-separator`.
- Ensure menu closes cleanly when strip is dragged or rack collapsed.

## Acceptance criteria

- [ ] **AC1 —** Right-clicking empty space in either rack suppresses native menu and displays custom menu with "Add Separator".
- [ ] **AC2 —** Clicking "Add Separator" instantiates a new separator in that rack and initiates inline text editing.
- [ ] **AC3 —** Right-clicking a separator card suppresses native menu and displays custom menu with "Delete".
- [ ] **AC4 —** Clicking "Delete" removes the targeted separator from the rack.
- [ ] **AC5 —** Right-clicking a flight strip card continues to toggle horizontal indentation (~28px) without opening the menu.
- [ ] **AC6 —** Context menu closes on outside click, item selection, or Escape key.
- [ ] **AC7 —** Unit tests in `stripsContextMenu.test.tsx` and `stripsBoard.test.tsx` pass 100%.

## Test plan

- Unit: Run `npm test src/ui/strips/test/stripsContextMenu.test.tsx`.
- Integration: Run `npm test src/ui/strips/test/stripsBoard.test.tsx`.

## Suggested files

- `src/ui/strips/StripsContextMenu.tsx`
- `src/ui/strips/StripsBoard.tsx`
- `src/ui/strips/strips.css`
- `src/ui/strips/test/stripsContextMenu.test.tsx`
- `src/ui/strips/test/stripsBoard.test.tsx`
