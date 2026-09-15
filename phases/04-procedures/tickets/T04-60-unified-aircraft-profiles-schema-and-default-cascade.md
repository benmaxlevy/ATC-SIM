# T04-60 Unified aircraft profiles schema and default cascade

**Phase:** 04 Procedures
**Priority:** P1
**Size:** M
**Depends on:** none
**Blocks:** T04-61, T04-62
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Replace the redundant multi-file profile data structure with a single consolidated `src/core/performance/aircraft-profiles.json` that defines baseline defaults and sparse aircraft overrides, and update `AircraftPerformanceRegistry` to cascade default regime values at runtime.

## Context

Currently, aircraft performance profiles are generated into a 6,666-line JSON file (`aircraft-profiles.generated.json`) where all 33 aircraft repeat identical 7-regime performance tables because OpenAP regime methods were left unpopulated. Maintaining `simulator-policies.json`, `type-mappings.json`, and `aircraft-profiles.generated.json` creates unnecessary complexity and file sprawl.

By defining a top-level `"defaults"` object and a sparse `"aircraft"` dictionary in a single file, empty aircraft entries `{}` or omitted fields automatically inherit defaults at runtime.

## Research

- Current registry implementation: `src/core/performance/registry.ts`
- Current types: `src/core/performance/types.ts`
- Prototype schema:
  ```json
  {
    "defaults": {
      "limits": { "minControlledSpeedKt": 100, "maxControlledSpeedKt": 340, "serviceCeilingFt": 41000 },
      "regimes": {
        "initialClimb": { "nominalClimbFpm": 2600, "nominalDescentFpm": 0, "maxBankDeg": 20, "accelKtPerS": 1.5, "decelKtPerS": 1.0 },
        "climb": { "nominalClimbFpm": 2000, "nominalDescentFpm": 0, "maxBankDeg": 25, "accelKtPerS": 1.0, "decelKtPerS": 0.8 },
        "enroute": { "nominalClimbFpm": 1000, "nominalDescentFpm": 1800, "maxBankDeg": 25, "accelKtPerS": 0.8, "decelKtPerS": 0.8 },
        "arrival": { "nominalClimbFpm": 0, "nominalDescentFpm": 2200, "maxBankDeg": 25, "accelKtPerS": 0.8, "decelKtPerS": 1.0 },
        "approach": { "nominalClimbFpm": 0, "nominalDescentFpm": 1200, "maxBankDeg": 25, "accelKtPerS": 0.8, "decelKtPerS": 1.2 },
        "landing": { "nominalClimbFpm": 0, "nominalDescentFpm": 750, "maxBankDeg": 15, "accelKtPerS": 0.8, "decelKtPerS": 3.8 },
        "missedApproach": { "nominalClimbFpm": 2200, "nominalDescentFpm": 0, "maxBankDeg": 20, "accelKtPerS": 1.2, "decelKtPerS": 1.0 }
      }
    },
    "aircraft": {
      "A20N": {},
      "B738": {},
      "B744": {}
    }
  }
  ```

## Scope

- Create `src/core/performance/aircraft-profiles.json` with the consolidated `defaults` and the 33 target ICAO types under `"aircraft"`.
- Update `AircraftPerformanceRegistry` in `src/core/performance/registry.ts`:
  - Load and validate the new JSON structure.
  - On `getProfile(icao)`: if `icao` exists in `aircraft`, merge its sparse properties over `defaults` (both top-level `limits` and per-regime `regimes`).
  - If `aircraft[icao]` is empty `{}` or missing regime fields, all default values are returned seamlessly.
  - Retain the exact existing `AircraftPerformanceProfile` interface so `world.ts`, `kinematics.ts`, and `lateral.ts` require no changes.
- Update `src/core/performance/types.ts` if needed to reflect the dataset format.
- Update unit tests in `src/core/performance/registry.test.ts` to test:
  - Empty aircraft object inheriting 100% of defaults.
  - Partial aircraft object overriding only specific regime fields (e.g. `nominalClimbFpm`).
  - Unknown aircraft falling back to `DEFAULT_PROFILE`.

## Out of scope

- Python generator modifications (T04-61).
- Deleting old JSON files (T04-62).
- Changes to flight kinematics or FMS guidance logic.

## Contract Table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `getProfile("B738")` where `aircraft.B738` is `{}` | Returns profile with all 7 regimes populated from `defaults` | Cached in-memory profile | Unknown type returns `DEFAULT_PROFILE` | `registry.test.ts` |
| `getProfile("B744")` with `nominalClimbFpm: 1650` override | Returns profile with climb 1650 fpm and other regimes from `defaults` | Cached in-memory profile | Non-finite override ignored, falls back to default | `registry.test.ts` |
| `has("B738")` | Returns `true` for all defined keys in `aircraft` | Read-only check | Returns `false` for unknown type | `registry.test.ts` |

## Acceptance criteria

- [ ] **AC1 — Consolidated schema:** `src/core/performance/aircraft-profiles.json` exists with valid `"defaults"` and 33 ICAO keys.
- [ ] **AC2 — Cascade defaults:** Requesting a profile for an empty aircraft object returns complete limits and 7 regimes populated from `"defaults"`.
- [ ] **AC3 — Sparse overrides:** Explicit fields on an aircraft record (such as `maxControlledSpeedKt` or `nominalClimbFpm`) override default values while unmentioned fields retain defaults.
- [ ] **AC4 — Compatibility:** `AircraftPerformanceRegistry.getProfile()` returns an object conforming to `AircraftPerformanceProfile`. No changes required in `src/core/world.ts` or `src/core/kinematics.ts`.
- [ ] **AC5 — Test coverage:** Unit tests in `registry.test.ts` verify complete inheritance, partial overrides, and unknown-type fallback.

## Test plan

- **Unit:** `npm test src/core/performance/registry.test.ts` passes with synthetic and full dataset fixtures.
- **CI:** `npm run typecheck` and `npm run test` pass cleanly.

## Suggested files

- `src/core/performance/aircraft-profiles.json`
- `src/core/performance/registry.ts`
- `src/core/performance/types.ts`
- `src/core/performance/registry.test.ts`
