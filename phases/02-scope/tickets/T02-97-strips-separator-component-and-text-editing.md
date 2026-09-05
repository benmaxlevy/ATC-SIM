# T02-97 Flight Progress Strips Separator Domain Model, Component, and Direct Text Editing

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-96
**Blocks:** T02-98
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the flight progress strip separator domain model, the `StripSeparator` visual component with distinct ATC divider styling, and direct in-place text editing allowing controllers to enter and modify separator labels directly on the strip bar.

## Context

In physical ATC tower cabs and terminal radar rooms (as well as virtual platforms like vStrips/vNAS), controllers use physical separator bars (plastic or colored dividers / header tabs) to segregate strips within a rack bay by runway (e.g. `RWY 27L`, `RWY 26R`), sequence phase (`HOLDING`, `PROPOSED`, `DEPARTING`), or airspace sector (`LOCAL 1`, `NORTH DEPARTURES`).

Separators act as full-width divider items within the strip list:
- They render with a distinctive divider style contrasting against flight strips (e.g., dark charcoal/slate background, high-contrast borders, bold uppercase typography).
- Controllers need to type text directly on the separator.
- When newly created, the separator should immediately activate inline text editing with autofocus.
- Clicking or double-clicking an existing separator's text allows editing the label in place.
- Committing text on `Enter` or blur saves the text; `Escape` restores the previous label.

## Research

- **FAA Order 7110.65 Chapter 2 §3** (Flight Progress Strips and Bay Organization).
- **vNAS / vStrips Specifications** (Virtual NAS Strip Bay divider and spacer bars).
- Analog term: *Bay Divider / Strip Separator*. Trainer delta: Web-based interactive inline text field with monospace uppercase styling fitting the dark controller workstation.

## Scope

- **`src/ui/strips/types.ts`**:
  - Define `StripSeparator`:
    ```ts
    export interface StripSeparator {
      id: string;
      label: string;
      section: "departures" | "arrivals";
      indented?: boolean;
      createdAt?: number;
    }
    ```
  - Define union or rack item types if needed (e.g. `RackStripItem = FlightStrip | StripSeparator;` or helper type guards `isSeparator(item)`).
- **`src/ui/strips/StripSeparator.tsx`**:
  - React component rendering a separator divider card.
  - Props:
    - `separator: StripSeparator`
    - `isEditing?: boolean`
    - `onUpdateLabel?: (id: string, newLabel: string) => void`
    - `onEndEdit?: (id: string) => void`
    - `onContextMenu?: (e: React.MouseEvent, separator: StripSeparator) => void`
    - `draggable?: boolean`
    - `isDragging?: boolean`
    - `onDragStart?: (e: React.DragEvent) => void`
    - `onDragEnd?: (e: React.DragEvent) => void`
    - `onDragOver?: (e: React.DragEvent) => void`
    - `onDrop?: (e: React.DragEvent) => void`
  - Inline text editing:
    - Renders `<input type="text" />` when editing, styled to blend seamlessly into the separator bar.
    - Autofocus and select text on mount when editing.
    - `onKeyDown`: `Enter` calls `onUpdateLabel` and finishes editing; `Escape` cancels editing without saving; `stopPropagation` to prevent keyboard chords from bubbling.
    - `onBlur`: commits current text and finishes editing.
  - Display mode:
    - Clicking or double-clicking the label toggles into edit mode.
    - Text displayed in bold uppercase monospace font.
  - Drag handlers matching `DepartureStrip` / `ArrivalStrip`.
- **`src/ui/strips/strips.css`**:
  - Style `.strip-separator`:
    - Full width matching strip rack dimensions (`max-width: 840px`).
    - Compact divider height (~36px–40px) or strip height.
    - Dark slate background (`#21262d` or `#2b313c`) with distinct border (`#484f58`).
    - Colored left accent bar or border (e.g. `#58a6ff`, `#00ff00`, or `#e5a93c`).
    - Uppercase bold monospace font (`"IBM Plex Mono"`, `Consolas`, monospace).
  - Style `.strip-separator-input`:
    - Transparent or dark background, high-contrast text (`#ffffff`), no awkward default borders, uppercase typing.
  - `.strip-separator.strip-dragging`: reduced opacity (0.4) and grabbing cursor.
  - `.strip-separator.strip-indented`: horizontal offset if indented.
- **Unit Tests (`src/ui/strips/test/stripSeparator.test.tsx`)**:
  - Renders separator label in display mode.
  - Switches to edit mode on click/double-click.
  - Auto-focuses input and updates label on typing.
  - Commits label on `Enter` and on blur.
  - Cancels edit on `Escape`.
  - Right-click fires `onContextMenu`.
  - Applies drag classes during dragging.

## Out of scope

- Context menu rendering (handled in T02-98).
- Bay drag reordering orchestration and World telemetry reconciliation (handled in T02-99).
- Arbitrary color pickers or emoji pickers.

## Implementation notes

- Keep input uppercase by applying `text-transform: uppercase` in CSS and normalizing values to uppercase on commit.
- Prevent click and drag conflicts while actively editing text in the `<input>`.

## Acceptance criteria

- [ ] **AC1 —** `StripSeparator` model is defined in `types.ts` with `id`, `label`, `section`, and optional `indented`.
- [ ] **AC2 —** `StripSeparator` renders as a distinct bay divider bar with dark contrast styling and uppercase monospace typography.
- [ ] **AC3 —** Direct text entry is available via inline input, with auto-focus on edit and commit on `Enter` or `blur`.
- [ ] **AC4 —** Pressing `Escape` while editing cancels without persisting modifications.
- [ ] **AC5 —** Right-clicking the separator invokes `onContextMenu` with event prevented.
- [ ] **AC6 —** Unit tests in `src/ui/strips/test/stripSeparator.test.tsx` pass 100%.

## Test plan

- Unit: Run `npm test src/ui/strips/test/stripSeparator.test.tsx`.
- Integration: Verify clean rendering within `StripsBoard`.

## Suggested files

- `src/ui/strips/types.ts`
- `src/ui/strips/StripSeparator.tsx`
- `src/ui/strips/strips.css`
- `src/ui/strips/index.ts`
- `src/ui/strips/test/stripSeparator.test.tsx`
