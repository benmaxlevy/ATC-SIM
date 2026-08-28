# T02-57 Coordination (Departure Release) and Video Maps Lists

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-55
**Blocks:** T02-60
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the in-scope **Coordination List** (hold-for-release departure management with `[F13]` release keys, flashing unreleased departures, and auto-release modes) and **Video Maps List** (in-scope map directory with `GEO MAPS`, `SYS PROC`, `CURRENT` categorization), matching Vice `stars/lists.go` and `cmdops.go`.

## Context

In Vice and real STARS, departure controllers manage tower releases through in-scope Coordination Lists. Unreleased departures flash with an asterisk `*`; once released, they show a steady plus `+` before departing. The Video Maps list allows browsing and toggling video maps directly on the radar scope.

## Research

- **Analog:** CRC STARS Coordination Lists & Maps List / Vice `stars/lists.go` (`drawCoordinationLists`, `drawMapsList`, `cmdops.go` release commands).
- **Glossary:** Coordination List, Hold For Release, Release Departure, Video Maps List, `GEO MAPS`, `SYS PROC`.
- **Trainer delta:** Coordinated departures integrate with `world.aircraft` spawning queue and hold-for-release simulation state.

## Scope

- Implement **Coordination List**:
  - Displays pending and released departures for adapted coordination points/airports.
  - Header renders list ID (e.g. `A`), facility name (e.g. `REPUBLIC`), and `AUTO` badge when auto-release is enabled.
  - Format: `[INDEX] [ACID] [ACTYPE] [BEACON] [EXIT] [REQ_ALT]`.
  - Unreleased flights render with flashing `*` (flashing at 1 Hz); released flights render with steady `+`.
  - Implement `[F13]` keyboard commands:
    - `[F13]`: Release single unreleased departure (or error `ILL FLIGHT` if 0, `MULTIPLE FLIGHTS` if > 1).
    - `[F13] (ACID)` / `[F13] (FLID)`: Release specific aircraft; if already released, remove from list.
    - `[F13]P(ID) A*`: Enable automatic release for the coordination list.
    - `[F13]P(ID) M*`: Disable automatic release (manual mode).
    - `[F13]T` / `[F13]TE` / `[F13]TI`: Toggle / enable / inhibit empty coordination list display.
    - `[MULTIFUNC]P(ID)[SLEW]` / `[MULTIFUNC]P(ID)(##)`: Position and set line count.
- Implement **Video Maps List**:
  - Toggle visibility: `[MULTIFUNC]TX`, position: `[MULTIFUNC]TX[SLEW]`, line count: `[MULTIFUNC]TX(###)`.
  - Displays active maps with `>` indicator.
  - Formats: `> [MAP_ID] [SHORT_LABEL] [LONG_NAME]`.
  - Supports category filters: `GEO MAPS`, `SYS PROC`, and `CURRENT` (showing only active maps).

## Out of scope

- General TAB / VFR / Tower lists (owned by T02-56).
- DCB spinner/menu changes (owned by T02-58 and T02-59).

## Implementation notes

- Connect coordination list releases to departure release state on `World` (releasing triggers departure roll within 30–60s).
- Ensure 1 Hz flashing timer synchronizes with existing STARS datablock blink phase.

## Acceptance criteria

- [ ] **AC1 —** Coordination list renders unreleased flights flashing with `*` and released flights steady with `+`.
- [ ] **AC2 —** `[F13]` releases single pending flight; `[F13] ACID` releases specific target.
- [ ] **AC3 —** `[F13]P(ID) A*` enables auto-release and displays `AUTO` in header; `M*` restores manual mode.
- [ ] **AC4 —** Video Maps list displays map directory with `>` for active maps and responds to `[MULTIFUNC]TX` commands.
- [ ] **AC5 —** Automated tests verify release lifecycle, auto-release transitions, and map directory toggles.

## Test plan

- Unit: `src/scope/coordinationList.test.ts` (release actions, auto-release, flashing states, video maps list).
- Integration: `src/scope/systemLists.integration.test.ts` (coordinated departure roll on canvas).

## Suggested files

- `src/scope/systemLists.ts`
- `src/scope/coordinationList.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.ts`
- `src/scope/coordinationList.test.ts`
