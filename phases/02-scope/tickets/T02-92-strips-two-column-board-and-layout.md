# T02-92 Flight Progress Strips Two-Column Board and Bay Layout

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-91
**Blocks:** T02-93
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement `StripsBoard` with a simulated controller cab backdrop, facility header, and two independent vertically scrollable rack columns (Departures on the left, Arrivals on the right).

## Context

Virtual tower and TRACON positions organize flight strips into physical bays or racks:
- Dark background representing an ambient cab environment (`#1A1E24`).
- Header bar displaying facility title (e.g. `KATL_TWR — Flight Progress Strips`).
- Two-column rack bay container (`.bay-container`):
  - Left rack: "Departures" with total strip count badge and scrollable strip list.
  - Right rack: "Arrivals" with total strip count badge and scrollable strip list.
- Racks scroll vertically independently while the board locks to viewport dimensions (`height: 100vh`, `overflow: hidden`).

## Scope

- **`src/ui/strips/StripsBoard.tsx`**:
  - Main board component accepting props:
    - `departures?: DepartureStripData[]`
    - `arrivals?: ArrivalStripData[]`
    - `facilityTitle?: string`
    - `onSelectStrip?: (strip: FlightStrip) => void`
  - Defaulting to `mockFixture` departures and arrivals if not provided.
  - Renders header, Departures rack with `DepartureStrip` children, and Arrivals rack with `ArrivalStrip` children.
- **`src/ui/strips/strips.css`**:
  - Styles for `.strips-board`: `100vw × 100vh`, `#1A1E24`, `overflow: hidden`.
  - Styles for `.board-header`: `#0D1117`, bottom border `#30363D`, monospace font.
  - Styles for `.bay-container`: `grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; overflow: hidden`.
  - Styles for `.rack-column`: `#24292E`, border `#444D56`, flex column.
  - Styles for `.rack-header`: `#2F363D`, border `#444D56`, uppercase text.
  - Styles for `.rack-strip-list`: `gap: 4px; padding: 8px; overflow-y: auto; flex: 1`.
- **`src/ui/strips/index.ts`**:
  - Export `StripsBoard`.
- **`src/ui/strips/test/stripsBoard.test.tsx`**:
  - Unit tests verifying header title, rack counts, rendering of strips from props and default mock, and independent rack structure.

## Out of scope

- URL query mount and scope shell integration (handled in T02-93).

## Acceptance criteria

- [ ] **AC1 —** `StripsBoard` renders the header and 2-column rack container with Departures and Arrivals racks.
- [ ] **AC2 —** Rack headers render counts matching departures and arrivals arrays.
- [ ] **AC3 —** Strip lists support independent vertical scrolling without overflowing board viewport.
- [ ] **AC4 —** Default fallback loads `mockFixture` seed data seamlessly.
- [ ] **AC5 —** Unit tests in `src/ui/strips/test/stripsBoard.test.tsx` pass 100%.

## Test plan

- Run `npm test src/ui/strips/test/stripsBoard.test.tsx`.
