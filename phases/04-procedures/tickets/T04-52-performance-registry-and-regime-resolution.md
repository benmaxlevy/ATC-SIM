# T04-52 Performance registry and regime resolution

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-51
**Blocks:** T04-53, T04-54
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Core resolves a supported generated profile or a safe TypeScript default from
only `Aircraft.aircraftType`, then selects a generic current-flight regime.

## Context

T04-51 provides immutable generated JSON. `stepWorld` owns motion; Pilot owns
intent. Existing lateral and vertical intent modes already distinguish SID,
STAR, approach, missed, and landing behavior without facility-specific state.

## Scope

- Define strict core performance dataset/profile/provenance types.
- Import committed generated JSON once and expose pure profile lookup.
- Export a TypeScript-owned `DEFAULT_PROFILE` preserving current 3 deg/s,
  1800 fpm, and 1 kt/s behavior when data is absent, malformed in development,
  unlisted, or `UNRESOLVED`.
- Normalize only ICAO identity (trim/uppercase); no aliases in runtime.
- Add pure regime resolution using current generic aircraft intent/FMS mode:
  landing, missed approach, approach, arrival, initial climb/climb under SID,
  then enroute. Make SID threshold policy data-driven, not airport-specific.
- Keep selected engine/variant/provenance observable for developer diagnostics,
  but never add them to scenario input or mutable Aircraft state.

## Out of scope

- Changing motion, FMS lead turn, GS caps, alerts, parser, scenario schema, or
  UI; T04-53 owns physics consumption.
- Runtime JSON fetching, profile editing UI, engine variants, or facility rules.

## Acceptance criteria

- [ ] **AC1 — Lookup:** `B738` resolves its generated supported profile;
  whitespace/case normalize; omitted, unknown, and `UNRESOLVED` resolve exactly
  `DEFAULT_PROFILE`.
- [ ] **AC2 — No family leak:** A mapped ICAO profile never resolves for a
  different ICAO key unless it is the explicit default fallback.
- [ ] **AC3 — Regimes:** Synthetic aircraft cover every regime from lateral and
  vertical modes, including generic SID initial-climb-to-climb transition,
  STAR arrival, LOC/GS approach, missed, and landing.
- [ ] **AC4 — Data boundary:** Registry imports committed JSON synchronously;
  no network/Python/OpenAP dependency or mutation of aircraft/scenario state.
- [ ] **AC5 — Compatibility:** Default profile numerically preserves current
  rates and existing global constants remain available until T04-53 migrates
  every consumer.
- [ ] **AC6 — Automated:** Tests use synthetic minimal records for registry and
  regime behavior; production profile tests only validate generated-data shape.

## Test plan

- **Unit:** Dataset guard, normalization, fallback, each regime resolver path.
- **Integration:** Load generated profile dataset and prove initial-profile
  records are addressable without asserting profile ordering/counts.
- **Manual:** None.

## Suggested files

- `src/core/performance/types.ts`
- `src/core/performance/registry.ts`
- `src/core/performance/regime.ts`
- `src/core/performance/*.test.ts`
- `src/core/index.ts`
