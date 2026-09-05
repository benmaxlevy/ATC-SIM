# T02-96 Flight Progress Strips Reordering and Indentation Integration and Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-95
**Blocks:** None
**Launch:** Implement this ticket only.

## Goal

Integrate strip reordering and right-click indentation with live simulation traffic in `shell.tsx` and standalone view `?view=strips`, ensuring custom sequence order and indented state persist across World telemetry updates without regressing track selection, radar interaction, or layout controls.

## Context

In the live simulation, `terminalStripsFromWorld(world)` derives fresh strip data periodically or on aircraft state change.
- The controller's custom manual order must be preserved across updates:
  - Existing strips retain their user-specified sequence.
  - Newly spawned aircraft append cleanly to their corresponding rack.
  - Terminated or handed-off aircraft are pruned from the rack order.
- Indented ("cocked") state must persist across telemetry updates for the same aircraft.
- Left-clicking a strip continues to select the aircraft track on the radar scope (`selectTrackFromFlightStrip`) without interfering with drag initiation or right-click indentation.

## Scope

- **`src/ui/strips/StripsBoard.tsx`**:
  - Reconcile ordered strip IDs with incoming `departures` and `arrivals` props:
    - Retain existing custom ordering for aircraft still present.
    - Append any new aircraft to the end of the rack order.
    - Prune removed aircraft IDs from order state and `indentedStripIds`.
  - Expose optional callback props:
    - `onReorderStrips?: (section: "departures" | "arrivals", stripIds: string[]) => void;`
    - `onToggleIndent?: (stripId: string, indented: boolean) => void;`
- **Integration in `src/ui/shell.tsx`**:
  - Mount `<StripsBoard />` in the expandable drawer, ensuring custom strip ordering and indentation states function alongside radar operations.
- **Acceptance Tests (`src/ui/strips/test/stripsAcceptance.test.tsx`)**:
  - Test suite covering:
    - Dragging to reorder departure strips moves the strip to the new position.
    - Dragging to reorder arrival strips moves the strip to the new position.
    - Rejection of cross-rack dragging (departures cannot drop in arrivals, and arrivals cannot drop in departures).
    - Visual drop indicator line appears during drag and disappears on drop/cancel.
    - Right-click indents an unindented strip; second right-click unindents it.
    - Left-click selects the aircraft in `World.selectedAircraftId`.
    - Reconciliation preserves custom order and indent state when props update with new/removed aircraft.
- **Documentation**:
  - Update `phases/02-scope/README.md` catalog with T02-94–96.
  - Update `phases/SWARM.md` with Twenty-eighth swarm plan.
  - Update `phases/LATER-IMPLEMENTATION-BACKLOG.md` (remove drag reordering and strip cocking from deliberately missing list).
  - Update `phases/SWARM-STATUS.md`.

## Out of scope

- Manual strip editing or pen annotation drawings.
- Dragging strips across different browser tabs/windows.

## Acceptance criteria

- [ ] **AC1 —** In-scope strips drawer and standalone `?view=strips` support drag-and-drop reordering within Departures and Arrivals racks.
- [ ] **AC2 —** Visual drop indicator line shows candidate insertion position during drag.
- [ ] **AC3 —** Right-clicking once toggles strip indentation (~28px offset) with native browser menu suppressed.
- [ ] **AC4 —** Left-clicking a strip selects the matching aircraft in `World.selectedAircraftId` without triggering drag or indent.
- [ ] **AC5 —** Custom sequence order and indentation persist across dynamic `World` telemetry ticks.
- [ ] **AC6 —** End-to-end acceptance suite `stripsAcceptance.test.tsx` passes 100%.
- [ ] **AC7 —** CI (`npm run ci` or test suite) passes with zero regressions.

## Test plan

- Run `npm test src/ui/strips/test/stripsAcceptance.test.tsx`.
- Run `npm test src/ui/strips/test/`.
