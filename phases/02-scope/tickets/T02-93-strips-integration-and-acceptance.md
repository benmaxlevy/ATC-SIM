# T02-93 Flight Progress Strips Integration and Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-92
**Blocks:** None
**Launch:** Implement this ticket only.

## Goal

Integrate `StripsBoard` into the application with standalone URL routing (`?view=strips`), shell toggle integration, track selection synchronization with `World`, and comprehensive end-to-end acceptance tests.

## Context

Flight progress strips must be accessible in two workflows:
1. **Standalone tab/window**: Controller opening `?view=strips` on a second monitor for dedicated strip management.
2. **In-scope overlay/toggle**: Controller toggling strip board view from within the radar workstation.
3. **Radar synchronization**: Clicking a strip's ACID selects the corresponding track in `World.selectedAircraftId`.

## Scope

- **`src/main.tsx`**:
  - Check `window.location.search` for `view=strips`. If active, render `<StripsBoard />` directly in `#root`.
- **`src/ui/shell.tsx`**:
  - Add a button or hotkey (e.g., toolbar button or `STRIPS` toggle) to open the strips board in a new window or overlay modal.
- **Track Selection**:
  - Wire `onSelectStrip` to `setSelectedAircraft(world, aircraftId)` when an aircraft matches the strip's callsign or id.
- **`src/ui/strips/test/stripsAcceptance.test.tsx`**:
  - Comprehensive acceptance tests validating:
    - `?view=strips` root rendering.
    - Track selection synchronization between strip click and `World`.
    - End-to-end formatting fidelity across mock departures and arrivals.
- **Documentation**:
  - Update `phases/02-scope/README.md` catalog with T02-90–93.
  - Update `phases/LATER-IMPLEMENTATION-BACKLOG.md` for later strip enhancements (real-time World normalization engine, handwritten canvas drawing, drag-and-drop rack reordering, strip cocking).
  - Update `phases/SWARM-STATUS.md`.

## Out of scope

- Handwritten pen strokes or canvas signatures.
- Drag-and-drop physical rack animation.

## Acceptance criteria

- [x] **AC1 —** Loading with `?view=strips` renders the `StripsBoard` component in `#root`.
- [x] **AC2 —** Clicking a strip selects the matching aircraft in `World.selectedAircraftId`.
- [x] **AC3 —** End-to-end acceptance suite `stripsAcceptance.test.tsx` passes.
- [x] **AC4 —** Full repository CI (`npm run ci`) passes with zero errors and formatting verified.

## Test plan

- Run `npm test src/ui/strips/test/stripsAcceptance.test.tsx`.
- Run `npm run ci`.
