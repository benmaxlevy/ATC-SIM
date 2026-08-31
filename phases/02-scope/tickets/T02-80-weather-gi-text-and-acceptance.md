# T02-80 Weather GI text and integration acceptance

**Phase:** 02 Scope (Weather & Altimeter addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-78, T02-79
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

Wire live METAR surface observations (wind, visibility, conditions) into GI TEXT lines, complete end-to-end wiring of the weather polling loop through scenario boot and the scope render cycle, update backlog and docs, and verify zero regressions.

## Context

The GI TEXT slots (10 max, toggled via DCB GI TEXT FILTER) are authored in the scenario JSON (`giTextLines`). This ticket decides how live METAR data is surfaced there: a designated GI slot (e.g. slot 9 or 10) is optionally reserved in the scenario JSON for live surface weather summary; all other slots remain authored static text. The airport list continues to come from `scenario.ssaWeatherAirports` defined in T02-78 — no runtime command changes it.

## Research

Read **R07** GI text / SSA, **R05** display data, and CRC STARS documentation.

- CRC docs: GI TEXT has 10 slots, toggled via DCB GI TEXT FILTER submenu. In CRC, GI text is broadcast system text (controller-typed), not a live METAR feed. For the trainer, we format METAR surface conditions into authored GI slots.
- **Airport list is scenario JSON, not a runtime command.** `scenario.ssaWeatherAirports` from T02-78 is the single source of truth for which airports have weather fetched. The primary airport (`[0]`) drives SSA Line 3 (T02-79); all airports can optionally contribute to GI text.
- Terms: **GI TEXT**, **surface wind**, **METAR observation**, **ATIS**.
- Example GI slot format for live METAR: `KATL 00000KT 10SM 30/22 A3018`.
- Comment template:
  ```ts
  /** Analog: CRC STARS GI TEXT (docs.virtualnas.net/crc/stars).
   *  Slots authored in scenario JSON; live METAR summary written to reserved slot(s).
   *  Airport list from scenario.ssaWeatherAirports — scenario data, not a runtime command. */
  ```

## Scope

- Define a convention in the scenario JSON for a "live METAR" GI slot:
  - Add optional `ssaWeatherGiSlot?: number` (0-indexed, 0–9) to `Scenario`. When present, that slot is overwritten at runtime with a formatted METAR summary for `ssaWeatherAirports[0]`. When absent, no GI slot is auto-populated.
  - All other `giTextLines` entries remain authored static text (existing behaviour unchanged).
- Wire the polling loop in the scope render/update path:
  - On scenario boot: immediately attempt METAR fetch for all `ssaWeatherAirports`; populate `ScopeView.primaryAltimeter` and `airportAltimeters` once resolved.
  - Periodic refresh: every 5 minutes trigger a re-fetch and update the relevant `ScopeView` fields in place. Use a timer / `setInterval` isolated to the weather client, not the sim tick.
  - On error: retain last successful values; do not throw.
- Ensure `npm test` / CI run with zero live network calls. All weather paths mock via `testdata/wx/metar-katl.json`.
- Update `phases/02-scope/README.md` ticket table and `phases/LATER-IMPLEMENTATION-BACKLOG.md` (close SSA altimeter / METAR follow-up items).

## Out of scope

- Any runtime command to add/remove airports. The list is `scenario.ssaWeatherAirports` period.
- Voice ATIS synthesis.
- Runway reassignment based on wind.
- Third-party paid weather APIs.

## Implementation notes

- Network requests are isolated to `metarClient.ts` (T02-78); no `fetch` calls directly in render or state files.
- No `window.alert` or unhandled promise rejection on network drop.
- DCB GI TEXT FILTER submenus must continue toggling each slot cleanly, including a live-weather slot.
- `ssaWeatherGiSlot` is optional; scenario KDEM likely omits it, KATL scenario sets it.

## Acceptance criteria

- [ ] **AC1 —** `ssaWeatherGiSlot` added to `Scenario` type; KATL scenario sets it; omitting it leaves all GI slots static.
- [ ] **AC2 —** Live METAR summary appears in the designated GI slot within one polling cycle of boot.
- [ ] **AC3 —** Polling refresh updates SSA altimeter and GI slot every 5 minutes without visual glitch.
- [ ] **AC4 —** Full test suite (`npm test` / `npm run ci`) passes with zero live HTTP calls and zero regressions.
- [ ] **AC5 —** `phases/02-scope/README.md` and `phases/LATER-IMPLEMENTATION-BACKLOG.md` updated.
- [ ] **AC6 — Research:** Code comment cites CRC GI TEXT analog; notes airport list is scenario data only.

## Test plan

- Unit: GI slot formatter with live METAR vs authored fallback; polling scheduler with mocked interval.
- Integration: full scenario boot verifying SSA altimeter, satellite rows, and GI slot all populate from fixture data.
- End-to-end: `npm run ci` passes with 0 errors.

## Suggested files

- `src/scenario/types.ts` (add `ssaWeatherGiSlot?`)
- `src/scope/scopeView.ts` (fields for live altimeter state)
- `src/scope/ssa.ts`
- `src/scope/renderScope.ts`
- `src/scope/metarAcceptance.test.ts`
- `phases/02-scope/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
