# T02-78 METAR weather fetch and decode

**Phase:** 02 Scope (Weather & Altimeter addendum)
**Priority:** P0
**Size:** M
**Depends on:** none
**Blocks:** T02-79, T02-80
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Fetch real-time METAR weather JSON from `https://aviationweather.gov/api/data/metar?ids=<ICAO>&format=json`, decode observations (altimeter in inHg from `altim` hPa / `rawOb`, wind direction and speed, temperature, dewpoint, visibility, flight category, raw METAR), cache results in memory with a periodic refresh, and provide offline/test fixtures.

## Context

The SSA and scope currently use hardcoded altimeter stubs (`30.17`, `29.92`) and static GI text. This ticket implements the METAR client and decoder. Which airports are fetched is determined **entirely by the scenario JSON** — specifically a new optional `ssaWeatherAirports` field on `Scenario`. No runtime keyboard command adds or removes airports; the list is scenario data.

## Research

Read **R07** SSA / preview area, **R05** display data, and AviationWeather METAR API spec (docs.virtualnas.net/crc/stars).

- Source API: `https://aviationweather.gov/api/data/metar?ids=<ICAO1>,<ICAO2>&format=json`
- Altimeter encoding:
  - `altim`: pressure in hPa/mb (e.g. `1022.1` hPa → `30.18` inHg: `(altim * 0.029529983).toFixed(2)`).
  - `rawOb`: FAA raw METAR text containing `A3018` → `"30.18"`.
- Terms: **altimeter setting** (`ALTSTG`), **METAR**, **surface wind**, **visibility**.
- **Airport list is scenario config, not a runtime command.** Per CRC STARS docs, the airports whose weather appears in the SSA are determined by facility configuration (vNAS Data Admin). In this trainer, the equivalent is the scenario JSON: a new optional `ssaWeatherAirports?: string[]` field lists all ICAO airport IDs to fetch. The first entry is the primary airport (drives SSA Line 3 altimeter). Remaining entries are satellite airports (SSA matrix rows). No typed scope command changes this list at runtime.
- Comment template:
  ```ts
  /** Analog: CRC STARS SSA weather / Terminal Weather Display (docs.virtualnas.net/crc/stars).
   *  Airport list from scenario.ssaWeatherAirports — scenario data, not a runtime command.
   *  Live METAR from aviationweather.gov; cached and decoded for SSA/GI display. */
  ```

## Scope

- Add `ssaWeatherAirports?: string[]` to the `Scenario` type in `src/scenario/types.ts`:
  - Optional; when absent, defaults to `[scenario.icao]` (primary only, no satellite rows).
  - Populated in KATL scenario JSON (e.g. `["KATL", "KFTY", "KPDK", "KMGE", "KRYY"]`) and left absent or minimal in KDEM.
- Create `src/scope/wx/metarClient.ts`:
  - `fetchMetar(icaoCodes: string[]): Promise<MetarObservation[]>`
  - Parse JSON fields: `icaoId`, `reportTime`, `temp`, `dewp`, `wdir`, `wspd`, `visib`, `altim`, `rawOb`, `fltCat`.
  - Compute `altimeterInHg: string` from `altim` hPa → `(altim * 0.029529983).toFixed(2)`, falling back to parsing `A(\d{4})` from `rawOb` (e.g. `A3018` → `"30.18"`).
  - In-memory cache keyed by ICAO, configurable TTL (default 5 minutes), background refresh.
  - Graceful offline fallback: on network error return `null` per airport; callers fall back to scenario stub altimeter.
- Commit fixture `testdata/wx/metar-katl.json` (the sample payload from the request) for deterministic Vitest.

## Out of scope

- Runtime commands to add/remove airports from the weather list. The list lives in scenario JSON only.
- Paid weather APIs; IEM N0Q mosaic changes (T02-68–72 already ships that).
- Aircraft kinematic barometric corrections.

## Implementation notes

- Export clean TypeScript types:
  ```ts
  export interface MetarObservation {
    icaoId: string;
    reportTime: string;
    temp?: number;
    dewp?: number;
    wdir?: number;
    wspd?: number;
    visib?: string;
    altimHpa?: number;
    altimeterInHg: string; // e.g. "30.18"
    rawOb: string;
    fltCat?: string;
  }
  ```
- No live network calls during `npm test`. All Vitest tests use `testdata/wx/metar-katl.json` fixture via injected fetch mock.
- `scenario.ssaWeatherAirports ?? [scenario.icao]` is always the source of truth for which airports to fetch.

## Acceptance criteria

- [ ] **AC1 —** `ssaWeatherAirports` field added to `Scenario` type; KATL scenario JSON includes a realistic list; KDEM omits it (falls back to `[scenario.icao]`).
- [ ] **AC2 —** METAR decoder computes accurate `altimeterInHg` (`"30.18"` from `1022.1` hPa; verified against `A3018` in `rawOb`).
- [ ] **AC3 —** Multi-airport query sends all `ssaWeatherAirports` in one `ids=` request and returns keyed results.
- [ ] **AC4 —** Offline/network-error returns `null` per airport without throwing; fallback stub produces `"30.17"`.
- [ ] **AC5 —** Vitest tests cover decode, hPa→inHg, fallback, and cache TTL using fixture data only.
- [ ] **AC6 — Research:** Code comment cites CRC STARS analog; notes airport list is scenario data not a runtime command.

## Test plan

- Unit: `src/scope/wx/metarClient.test.ts` — parse KATL fixture, hPa→inHg rounding, null fallback, cache hit.
- Integration: mocked fetch verifying multi-airport batch and background refresh.

## Suggested files

- `src/scenario/types.ts` (add `ssaWeatherAirports?`)
- `src/scenario/katl.json` (add `ssaWeatherAirports`)
- `src/scope/wx/metarClient.ts`
- `src/scope/wx/metarClient.test.ts`
- `testdata/wx/metar-katl.json`
