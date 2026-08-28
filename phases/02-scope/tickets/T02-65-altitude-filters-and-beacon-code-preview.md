# T02-65 STARS Altitude Filters & Beacon Code Preview Commands

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-61
**Blocks:** T02-67
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the complete STARS Altitude Filter and Beacon Code management commands (Table 29 / Table 30) in the Preview Area: display current filters (`* F`), set altitude filter limits in hundreds of feet (`* LA [Floor] [Ceiling]`), add beacon code filters (`* BCN [Code]`), and remove beacon code filters (`* BCN DEL [Code]`), keeping full synchronization with `view.altitudeFilter`, `view.beaconSelectCodes`, and the SSA header readout.

## Context

In FAA STARS and CRC operations, controllers inspect and alter surveillance altitude gates and transponder code filters using quick `<MULTI>` commands. Entering `*F` displays current filter bounds in the Preview Area; `*LA` modifies the active filter limits.

## Research

- **Analog:** CRC STARS Command Reference Table 29 Altitude Filters & Table 30 Beacon Codes (docs.virtualnas.net/crc/stars — R07).
  - `* F <ENTER>`: Display current altitude filters in preview area readout.
  - `* LA [Floor] [Ceiling] <ENTER>`: Set Limited/Unassociated altitude filter limits (hundreds of feet, e.g. `* LA 000 120`).
  - `* BCN [Code] <ENTER>`: Add beacon code block or discrete code to active filter list.
  - `* BCN DEL [Code] <ENTER>`: Remove beacon code from filter list.
- **Glossary:** Altitude Filter Limits, Low Altitude (LA), Unassociated Altitude (UA), Beacon Filter Bank, Preview Readout.
- **Trainer delta:** Interacts with `view.altitudeFilter` (`src/scope/altitudeFilter.ts`) and `view.beaconSelectCodes` (`src/scope/previewArea.ts`).

## Scope

- Extend `PreviewArmedAction` with filter actions:
  - `{ type: "displayFilters" }`
  - `{ type: "setAltitudeFilterLimits"; floorHundreds: number; ceilingHundreds: number }`
  - `{ type: "addBeaconCodeFilter"; code: string }`
  - `{ type: "removeBeaconCodeFilter"; code: string }`
- Parse `* F <Enter>`:
  - Format current altitude filter bounds (e.g. `FIL 000-120`) in the Preview Area readout.
- Parse `* LA [Floor] [Ceiling] <Enter>`:
  - Validate 3-digit floor and ceiling values in hundreds of feet (e.g. `000` to `999`).
  - Update `view.altitudeFilter.floorFt` and `view.altitudeFilter.ceilingFt`.
- Parse `* BCN [Code] <Enter>`:
  - Validate 2-digit block (e.g. `45`) or 4-digit discrete squawk (e.g. `4501`).
  - Add to `view.beaconSelectCodes` if not already present.
- Parse `* BCN DEL [Code] <Enter>`:
  - Remove specified code from `view.beaconSelectCodes`.
- Reject invalid floor/ceiling (e.g. floor > ceiling) or non-octal squawk codes with `<buffer> INV`.

## Out of scope

- Direct F-chord numeric typing (already completed in T02-06).
- Target symbol rendering tweaks (already completed in T02-34).
- Radar beaconator momentary readout (owned by F1 / `*B`).

## Acceptance criteria

- [ ] **AC1 —** `* F <Enter>` displays the active altitude filter bounds in the Preview Area.
- [ ] **AC2 —** `* LA 000 120 <Enter>` updates the altitude filter limits to 0–12,000 ft and updates the SSA header display.
- [ ] **AC3 —** `* BCN 45 <Enter>` adds squawk block `45` to `view.beaconSelectCodes`, causing matching unassociated targets to paint `□`.
- [ ] **AC4 —** `* BCN DEL 45 <Enter>` removes the filter from `view.beaconSelectCodes`.
- [ ] **AC5 —** Invalid altitude numbers or malformed beacon codes flash `INV`.
- [ ] **AC6 —** Automated unit and integration tests prove filter readout, boundary updates, and beacon code toggles.

## Test plan

- Unit: `src/scope/previewArea.test.ts` (filter parsing, validation, deletion commands).
- Integration: `src/scope/altitudeFilter.test.ts` / `src/scope/targetSymbol.test.ts` (filter limits application, beacon box paint).

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/altitudeFilter.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/altitudeFilter.test.ts`
