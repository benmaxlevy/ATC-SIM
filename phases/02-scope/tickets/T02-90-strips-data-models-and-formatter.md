# T02-90 Flight Progress Strips Data Models and Formatter

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** None
**Blocks:** T02-91, T02-92, T02-93
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Establish the TypeScript domain models (`FlightRules`, `CWTCategory`, `BaseStripData`, `DepartureStripData`, `ArrivalStripData`, `FlightStrip`), strip transformation & formatting utilities (`formatEquipment`, `truncateField`, beacon padding, time formatting, revision indexing), and static seed fixture in `src/ui/strips/`.

## Context

FAA / vNAS terminal flight progress strips (7110.65 and virtual NAS specifications) use standardized machine-printed formats:
- **Equipment string (Box 3)**: Prefix with CWT wake category (`A/` through `I/`) or `H/` for heavy aircraft if CWT not active, followed by aircraft type, followed by optional equipment suffix (`/L`, `/G`, etc.).
- **Revision index (Box 2)**: Blank when unrevised (or 0); integer string (`"1"`, `"2"`, ...) when $\ge 1$.
- **Beacon code (Box 5)**: 4-digit zero-padded squawk string (`0120`, `4215`).
- **Times (Box 6/8)**: 4-digit Zulu representation `HHMM` (e.g. `1435`).
- **Route & Remarks truncation**: When route or remarks overflow allocated character limits (e.g. 65 characters), truncate and append `***`.

## Scope

- **`src/ui/strips/types.ts`**:
  - `FlightRules = 'IFR' | 'VFR'`
  - `CWTCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'`
  - `BaseStripData`: `id`, `acid`, `revisionNumber`, `rawType`, `equipmentSuffix`, `isHeavy`, `cwtCategory`, `cid`, `beaconCode`, `annotationBoxes` (`box8A`, `box8B`, `boxes10to18` array of length 9).
  - `DepartureStripData`: `stripType: 'DEPARTURE'`, `proposedDepartureTime`, `requestedAltitude`, `departureAirport`, `route`, `destinationAirport`, `remarks`.
  - `ArrivalStripData`: `stripType: 'ARRIVAL'`, `previousFix`, `coordinationFix`, `estimatedTimeOfArrival`, `flightRules`, `destinationAirport`, `remarks`.
  - `FlightStrip = DepartureStripData | ArrivalStripData`.
- **`src/ui/strips/stripFormatter.ts`**:
  - `formatEquipment(rawType: string, suffix?: string, options?: { isHeavy?: boolean; cwtCategory?: CWTCategory; useCWT?: boolean }): string`
  - `truncateField(text: string, maxLength: number): string`
  - `formatBeaconCode(code: string): string`
  - `formatTimeZulu(time: string): string`
  - `formatRevisionIndex(rev?: number): string`
- **`src/ui/strips/mockFixture.ts`**:
  - Static seed dataset containing 2 departures (`DAL882`, `SWA1902`) and 2 arrivals (`AAL412`, `N415SP`) adhering strictly to the data model.
- **`src/ui/strips/index.ts`**:
  - Re-export all new strip types, formatting utilities, and seed data while preserving existing exports (`FlightStrips`, `STRIP_BAY_HEADING`).
- **`src/ui/strips/test/stripFormatter.test.ts`**:
  - Comprehensive unit tests covering all formatting rules, CWT prefix combinations, boundary truncation with `***`, and mock fixture validation.

## Out of scope

- Direct DOM / React strip rendering (handled in T02-91).
- 2-Column rack board layout (handled in T02-92).
- Dynamic World/Aircraft normalization engine (later phase).

## Acceptance criteria

- [ ] **AC1 —** TypeScript models compile cleanly and express `DepartureStripData`, `ArrivalStripData`, and `FlightStrip`.
- [ ] **AC2 —** `formatEquipment` produces correct prefixes for CWT (`F/A321/L`), Heavy (`H/B772/L`), and standard (`B738/G`) aircraft.
- [ ] **AC3 —** `truncateField` leaves strings `<= maxLength` untouched, and trims with `***` when string exceeds `maxLength`.
- [ ] **AC4 —** `formatRevisionIndex` returns empty string for `undefined` or `0`, and stringified integers for $\ge 1$.
- [ ] **AC5 —** `formatBeaconCode` pads squawks to 4 digits.
- [ ] **AC6 —** Static mock fixture contains valid departures and arrivals matching the specification.
- [ ] **AC7 —** Unit tests in `src/ui/strips/test/stripFormatter.test.ts` pass 100%.

## Test plan

- Run `npm test src/ui/strips/test/stripFormatter.test.ts`.
