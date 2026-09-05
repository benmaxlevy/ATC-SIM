# T02-99 Strips Separator Drag Reordering, Telemetry Reconciliation, and Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-98
**Blocks:** None
**Launch:** Implement this ticket only.

## Goal

Integrate separators into intra-section drag-and-drop reordering alongside flight progress strips, reconcile user-created separators across dynamic live simulation World telemetry ticks so they persist without resetting, and verify end-to-end acceptance.

## Context

Flight progress strip bays contain a mix of flight cards and separator divider bars:
- Separators must participate in drag-and-drop reordering exactly like flight strips:
  - Dragging a separator allows moving it to any position in its rack column (above, below, or between flight strips and other separators).
  - Dragging a flight strip allows dropping it above or below a separator.
  - The visual drop indicator line (`.strip-drop-indicator`) displays candidate insertion positions between strips and separators.
  - Cross-section drags remain strictly disallowed (cannot drag a separator from Departures into Arrivals or vice-versa).
- Live simulation updates:
  - Aircraft spawn, update flight plans, or handoff/terminate, causing `terminalStripsFromWorld(world)` to deliver updated strip arrays to `StripsBoard`.
  - While flight strips reconcile against active aircraft in `World`, user-created separators are local to the bay and must NOT be pruned or discarded during reconciliation.
  - Separator positions in the custom rack sequence must remain stable across telemetry ticks.
  - Removing an aircraft leaves separators intact. Removing a separator leaves flight strips intact.

## Scope

- **`src/ui/strips/StripsBoard.tsx`**:
  - Unified rack sequence:
    - Rack items contain both flight strips and separators: `type RackItem = FlightStrip | StripSeparator`.
    - `orderedDepartures` and `orderedArrivals` lists render items in their ordered sequence.
  - Drag-and-Drop:
    - `handleDragStart` handles both `FlightStrip` and `StripSeparator`.
    - `handleDragOver` computes candidate insertion indices whether hovering over a flight strip or a separator.
    - `handleDrop` splices and reinserts the dragged item (strip or separator) at the target index in the rack's order.
    - Drop indicator line renders correctly before or after separators.
  - Telemetry Reconciliation:
    - Update `reconcileOrder` to accept known separator IDs:
      ```ts
      export function reconcileOrder(
        strips: FlightStrip[],
        currentOrder: string[],
        separatorIds: Set<string> = new Set()
      ): string[]
      ```
    - Retains separator IDs at their exact positions in `currentOrder`.
    - Retains existing flight strips that are still active in `strips`.
    - Appends newly spawned flight strips.
    - Prunes flight strip IDs that are no longer in `strips` (while preserving separators).
  - External Callbacks:
    - Support optional callbacks: `onAddSeparator`, `onDeleteSeparator`, `onUpdateSeparatorLabel`, `onReorderRack`.
- **End-to-End Acceptance Tests (`src/ui/strips/test/stripsAcceptance.test.tsx`)**:
  - Add comprehensive test suite covering:
    - Right-click empty rack space -> opens custom context menu -> "Add Separator" creates separator.
    - Entering text directly on the separator bar updates its label.
    - Dragging a separator reorders it among flight strips.
    - Dragging a flight strip above and below a separator moves the flight strip accurately.
    - Drop indicator line appears at target index when hovering over separator.
    - Cross-section drag rejection (departure separator cannot drop in arrivals).
    - Right-clicking separator -> "Delete" removes the separator.
    - Live World telemetry tick preserves separators, their text, and their positions in the rack.
    - Track selection on flight strip click continues to synchronize with `World.selectedAircraftId`.
    - Right-clicking flight strip still toggles indentation without opening menu.
- **Documentation**:
  - Update `phases/02-scope/README.md` with T02-97–99 entries.
  - Update `phases/SWARM.md` with Twenty-ninth swarm status.
  - Update `phases/SWARM-STATUS.md`.

## Out of scope

- Moving separators between Departures and Arrivals racks (cross-section transfer).
- Persisting separators to remote cloud backend (local session/in-memory only).

## Acceptance criteria

- [ ] **AC1 —** Controllers can create separators in empty bay space via right-click custom context menu.
- [ ] **AC2 —** Separator labels can be typed directly on the separator bar with inline editing.
- [ ] **AC3 —** Separators can be dragged and reordered within their rack among flight strips.
- [ ] **AC4 —** Strips can be dragged and reordered above/below separators with visual drop indicator line.
- [ ] **AC5 —** Separators can be deleted via right-click custom context menu.
- [ ] **AC6 —** User-created separators and their order persist across dynamic `World` simulation telemetry updates.
- [ ] **AC7 —** End-to-end acceptance tests in `stripsAcceptance.test.tsx` and full suite pass 100%.

## Test plan

- Integration: Run `npm test src/ui/strips/test/stripsBoard.test.tsx`.
- Acceptance: Run `npm test src/ui/strips/test/stripsAcceptance.test.tsx`.
- Full suite: Run `npm test`.

## Suggested files

- `src/ui/strips/StripsBoard.tsx`
- `src/ui/strips/test/stripsBoard.test.tsx`
- `src/ui/strips/test/stripsAcceptance.test.tsx`
- `phases/02-scope/README.md`
- `phases/SWARM.md`
- `phases/SWARM-STATUS.md`
