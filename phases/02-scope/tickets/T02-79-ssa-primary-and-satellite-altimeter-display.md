# T02-79 SSA primary and satellite altimeter display

**Phase:** 02 Scope (Weather & Altimeter addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-78
**Blocks:** T02-80
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Wire live METAR altimeter readings from T02-78 into the SSA: display the primary airport altimeter on SSA Line 3 (`HHMM/SS  30.18`), render satellite airport altimeter matrix rows in 3-airport blocks (`KATL 30.18  FTY 30.18  PDK 30.18`), and honour the `ALTSTG` SSA FILTER toggle for both.

## Context

In CRC STARS (docs.virtualnas.net/crc/stars), the SSA primary altimeter comes from the METAR for the airport assigned to tower list #1 in the facility configuration. Satellite airport altimeter rows list all other configured airports. In this trainer the equivalent is `scenario.ssaWeatherAirports` (introduced in T02-78): `ssaWeatherAirports[0]` is the primary airport, `ssaWeatherAirports[1..]` are the satellite airports. The list is scenario data — no runtime command changes it.

## Research

Read **R07** SSA / preview area, **R05** display data.

- CRC docs (line 3080): *"The next line consists of the current time in HHMM/SS, followed by the system altimeter. This altimeter reading comes from the VATSIM METAR for your primary airport. The primary airport is the one assigned to tower list #1 in the facility configuration."*
- CRC docs (line 3084): *"The next three lines… provide weather information (wind and altimeter) for any airports listed in the current facility configuration for inclusion in the SSA."*
- Trainer analog: `scenario.ssaWeatherAirports[0]` = primary; `ssaWeatherAirports[1..]` = satellite. Defined in scenario JSON; no runtime command.
- Terms: **SSA**, **primary altimeter**, **satellite altimeter matrix**, **ALTSTG**.
- SSA Line 3: `${formatSsaTime(simTimeMs)}  ${primaryAltimeter}` — e.g. `1620/02  30.18`.
- Satellite rows: 3 airports per line — e.g. `KATL 30.18  FTY 30.18  PDK 30.18` then `KMGE 30.18  KRYY 30.18`.
- `ALTSTG` SSA FILTER: hides primary altimeter from Line 3 AND hides all satellite rows.
- Comment template:
  ```ts
  /** Analog: CRC STARS SSA Altimeter & Satellite Matrix (docs.virtualnas.net/crc/stars).
   *  Primary = ssaWeatherAirports[0]; satellite = ssaWeatherAirports[1..].
   *  Airport list is scenario data, not a runtime command. */
  ```

## Scope

- Update `src/scope/ssa.ts`:
  - `buildSsaRenderLines` already accepts `primaryAltimeter` and `airportAltimeters`. Wire them to live `MetarObservation` data from T02-78.
  - Add `formatSatelliteAltimeterLines(altimeters: readonly SsaAirportAltimeter[]): string[]` — groups entries in chunks of 3, formats each as `ICAO XX.XX` separated by two spaces.
  - When `vis.ALTSTG` is false: suppress primary altimeter from Line 3 (show time alone) AND skip all satellite altimeter rows.
  - Fallback: when METAR is unavailable for an airport, use `scenario.altimeterStub ?? "30.17"` or the last cached value.
- Update `src/scope/renderScope.ts` (`drawSsa`):
  - Pass `ssaWeatherAirports[0]` METAR `altimeterInHg` as `primaryAltimeter`.
  - Pass `ssaWeatherAirports[1..]` METAR results as `airportAltimeters`.
  - Render satellite altimeter lines after the existing SSA block.

## Out of scope

- Any runtime keyboard command to change which airports are listed. Scenario JSON is the only source.
- CRC wind-in-SSA display (VATSIM-specific; real STARS does not show wind in SSA). Wind goes in GI TEXT (T02-80).
- DCB SSA FILTER layout changes (existing `ALTSTG` cell handles this already).

## Implementation notes

- Altimeter strings must always be `XX.XX` (two decimal places, no rounding drift).
- Use 3-wide ICAO short-form (4 chars, drop leading `K`/`EG`/etc. if needed to fit — or use full ICAO; match CRC display format which uses 3-char IDs like `ATL`, `FTY`).
- No direct import of `metarClient` from render paths — pass decoded altimeter strings via `SsaInput`; the caller in `renderScope.ts` or a wiring layer does the lookup.

## Acceptance criteria

- [ ] **AC1 —** SSA Line 3 shows live primary altimeter from `scenario.ssaWeatherAirports[0]` METAR (e.g. `1620/02  30.18`).
- [ ] **AC2 —** Satellite rows render `ssaWeatherAirports[1..]` in 3-airport blocks below the main SSA block.
- [ ] **AC3 —** Disabling `ALTSTG` hides primary altimeter from Line 3 and removes all satellite rows.
- [ ] **AC4 —** When METAR unavailable for an airport, falls back to scenario stub without crashing.
- [ ] **AC5 —** Vitest unit tests cover primary formatting, satellite chunking, ALTSTG masking, and fallback.
- [ ] **AC6 — Research:** Code comments cite CRC STARS SSA analog; note airport list is scenario data.

## Test plan

- Unit: `src/scope/ssa.test.ts` — primary altimeter line, satellite chunks of 3, ALTSTG toggle, stub fallback.
- Integration: `src/scope/renderScope.test.ts` — SSA draw with 5-airport list produces correct line count.

## Suggested files

- `src/scope/ssa.ts`
- `src/scope/ssa.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/renderScope.test.ts`
