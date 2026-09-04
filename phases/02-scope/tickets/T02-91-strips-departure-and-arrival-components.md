# T02-91 Flight Progress Strips Departure and Arrival Components

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-90
**Blocks:** T02-92, T02-93
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the React components `DepartureStrip` and `ArrivalStrip` matching the FAA/vNAS 4-column physical grid specifications, buff cardstock background, and monospace bold styling.

## Context

Flight progress strips adhere to rigid geometric proportions (approximately 7.5" to 8" wide by 1.5" tall, or `800px × 140px`).
- **Departure Strip**:
  - Master layout: 4 columns (~18%, ~14%, ~46%, ~22%).
  - Column 1: ACID (Box 1), Revision (Box 2), Formatted Equipment (Box 3), Computer ID (Box 4).
  - Column 2: Beacon code (Box 5), Proposed departure time (Box 6), Requested altitude (Box 7).
  - Column 3: Departure airport (Box 8), upper annotations (Box 8A, Box 8B), lower annotations (9 equal-width boxes 10–18).
  - Column 4: Route, destination airport, and remarks (Box 9).
- **Arrival Strip**:
  - Identical column layout, modifying Col 2 to Previous Fix (Box 6) and Coordination Fix (Box 7).
  - Col 3 Box 8 displays Estimated Time of Arrival (ETA).
  - Col 4 is split into Box 9 (Flight Rules 'I'/'V') and Box 9A (Destination & remarks).

## Scope

- **`src/ui/strips/DepartureStrip.tsx`**:
  - Functional component taking `strip: DepartureStripData`, optional `onSelect?: (stripId: string) => void`.
  - CSS Grid matching departure template: Col 1, Col 2, Col 3 (8, 8A/8B, 10–18), Col 4.
  - Calls `formatEquipment`, `formatRevisionIndex`, `formatBeaconCode`.
- **`src/ui/strips/ArrivalStrip.tsx`**:
  - Functional component taking `strip: ArrivalStripData`, optional `onSelect?: (stripId: string) => void`.
  - CSS Grid matching arrival template: Col 1, Col 2 (5, 6, 7), Col 3 (8 ETA, 8A/8B, 10–18), Col 4 split into Box 9 and Box 9A.
- **`src/ui/strips/strips.css`**:
  - Proportions: height `140px`, max-width `820px`.
  - Colors: background pale buff `#F5EEDC`, border `2px solid #222`, inner borders `1px solid #333`.
  - Typography: `Consolas, 'Courier New', monospace`, bold, uppercase.
  - Subgrid ratios for Col 1–4 matching specification.
- **`src/ui/strips/index.ts`**:
  - Export `DepartureStrip` and `ArrivalStrip`.
- **`src/ui/strips/test/stripComponents.test.tsx`**:
  - Unit tests verifying DOM structure, box labels, classes, text rendering, and click handlers.

## Out of scope

- 2-Column rack board container (handled in T02-92).
- URL route integration (handled in T02-93).

## Acceptance criteria

- [ ] **AC1 —** `DepartureStrip` renders 4 columns with subgrids matching the FAA departure layout.
- [ ] **AC2 —** `ArrivalStrip` renders 4 columns with previous fix, coordination fix, ETA, and split Col 4 (Box 9 rules + Box 9A destination/remarks).
- [ ] **AC3 —** Lower annotation rows render 9 equal-width boxes (10 to 18) and upper annotation rows render 8A and 8B.
- [ ] **AC4 —** Strips apply buff background (`#F5EEDC`), dark holder borders, and uppercase monospace fonts.
- [ ] **AC5 —** Unit tests in `src/ui/strips/test/stripComponents.test.tsx` pass 100%.

## Test plan

- Run `npm test src/ui/strips/test/stripComponents.test.tsx`.
