# T02-95 Flight Progress Strips Intra-Section Drag-and-Drop Reordering and Insertion Indicator Line

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-94
**Blocks:** T02-96
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement drag-and-drop reordering of flight progress strips constrained strictly within their respective section (Departures or Arrivals), rendering a visual insertion indicator line during drag that shows exactly where the strip will be placed if released.

## Context

Tower and radar controllers organize strips vertically within each bay to establish an operational sequence (e.g. runway departure queue, approach landing sequence).
- Strips belong strictly to their operational section: Departures must remain in the Departures rack, and Arrivals must remain in the Arrivals rack.
- During a drag operation, the user requires clear, real-time visual feedback showing the candidate insertion position between existing strips. An indicator line rendered across the rack width displays where the strip will land upon mouse release.
- Releasing the dragged strip outside its section or over the opposing rack cancels the drag with no change in order.

## Scope

- **`src/ui/strips/StripsBoard.tsx`**:
  - Maintain internal order for strips: `departureIds: string[]` and `arrivalIds: string[]` (reordering internal array of strips/IDs).
  - Drag State:
    - `draggedStrip: { id: string; section: "departures" | "arrivals"; sourceIndex: number } | null`.
    - `dropTarget: { section: "departures" | "arrivals"; targetIndex: number } | null`.
  - Drag Event Handlers:
    - `onDragStart(e, strip, section, index)`: Set HTML5 drag transfer data, register source section and strip ID.
    - `onDragOver(e, section, hoverIndex, stripElement)`:
      - Verify `draggedStrip.section === section` (reject cross-section drag by setting `dropEffect = "none"`).
      - Compute insertion index based on cursor vertical offset relative to strip midpoint (if `cursorY < midY` insert at `hoverIndex`, else `hoverIndex + 1`).
      - Set `dropTarget` state.
    - `onDragLeave(e, section)`: Clear `dropTarget` if leaving the rack container.
    - `onDrop(e, section)`: If `draggedStrip.section === section` and `dropTarget` valid, splice and reinsert strip at target index. Reset drag state.
    - `onDragEnd(e)`: Reset drag state and drop indicator line.
  - Drop Target Insertion Indicator:
    - Render `<div className="strip-drop-indicator" data-testid="strip-drop-indicator" />` at the computed `targetIndex` in the rack's strip list.
- **`src/ui/strips/DepartureStrip.tsx` & `src/ui/strips/ArrivalStrip.tsx`**:
  - Add drag props:
    - `draggable?: boolean;`
    - `isDragging?: boolean;`
    - `onDragStart?: (e: React.DragEvent) => void;`
    - `onDragEnd?: (e: React.DragEvent) => void;`
    - `onDragOver?: (e: React.DragEvent) => void;`
  - Apply `strip-dragging` class when `isDragging={true}`.
- **`src/ui/strips/strips.css`**:
  - `.strip.strip-dragging`:
    - `opacity: 0.4;`
    - `cursor: grabbing;`
  - `.strip-drop-indicator`:
    - `height: 3px;`
    - `background-color: #ffff00;`
    - `box-shadow: 0 0 6px #ffff00;`
    - `border-radius: 1.5px;`
    - `width: 100%;`
    - `margin: 2px 0;`
    - `pointer-events: none;`
- **Unit Tests**:
  - In `src/ui/strips/test/stripsBoard.test.tsx`:
    - Dragging a departure strip over another departure strip shows the drop indicator line at the calculated insertion index.
    - Dropping a departure strip updates departure strip order.
    - Dropping an arrival strip updates arrival strip order.
    - Dragging a departure strip over the arrivals rack does not show the drop indicator and does not reorder arrivals or move the departure strip.
    - Canceling drag or dropping outside racks resets the indicator line without mutating order.

## Out of scope

- Cross-rack strip transfers (departures -> arrivals or vice-versa).
- Multi-strip batch dragging.

## Acceptance criteria

- [ ] **AC1 —** Strips are draggable within their rack column using mouse drag.
- [ ] **AC2 —** While dragging over a valid rack, a prominent `.strip-drop-indicator` line indicates the exact drop destination between strips.
- [ ] **AC3 —** Releasing the mouse button over a valid insertion point places the dragged strip at that position.
- [ ] **AC4 —** Strips cannot be dragged or dropped into the opposite rack (cross-section drag is rejected; no indicator is shown; order is untouched).
- [ ] **AC5 —** While actively dragging, the source strip applies `.strip-dragging` (reduced opacity).
- [ ] **AC6 —** Unit tests in `src/ui/strips/test/stripsBoard.test.tsx` pass 100%.

## Test plan

- Run `npm test src/ui/strips/test/stripsBoard.test.tsx`.
