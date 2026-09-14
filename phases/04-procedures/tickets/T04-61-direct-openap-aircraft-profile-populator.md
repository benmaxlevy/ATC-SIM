# T04-61 Direct OpenAP aircraft profile populator

**Phase:** 04 Procedures
**Priority:** P1
**Size:** M
**Depends on:** T04-60
**Blocks:** T04-62
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Rewrite `tools/aircraft-profiles/build_profiles.py` into a direct, single-file populator that reads `src/core/performance/aircraft-profiles.json`, directly queries OpenAP (`openap.prop.aircraft` and `openap.kinematic.WRAP`), extracts full kinematic data (corrected ceiling in feet, climb/descent vertical speeds, takeoff/landing accelerations, and regime speeds), and writes populated overrides with `"source": "openap"`.

## Context

The previous generator relied on three files (`simulator-policies.json`, `type-mappings.json`, and `aircraft-profiles.generated.json`) with an abstract JSON recipe format. T04-60 unified the dataset into `src/core/performance/aircraft-profiles.json`.

This ticket simplifies `build_profiles.py` to operate directly on the unified JSON file, calling OpenAP directly for populated airframes rather than routing through policy indirection. It also corrects the OpenAP ceiling unit conversion (meters to feet) and extracts a comprehensive set of regime kinematics from OpenAP WRAP so aircraft fly and climb/descend with realistic airframe-specific rates.

## Research

- OpenAP aircraft metadata: `openap.prop.aircraft(icao)`:
  - `vmo` -> `limits.maxControlledSpeedKt` (knots CAS)
  - `ceiling` -> `limits.serviceCeilingFt` (OpenAP returns ceiling in meters; MUST convert to feet via `meters * 3.280839895`)
- OpenAP WRAP kinematics: `openap.kinematic.WRAP(icao)`:
  - Vertical speeds (m/s converted to fpm via `abs(val) * 196.8504`):
    - `initclimb_vs()` -> `initialClimb.nominalClimbFpm`
    - `climb_vs_concas()` -> `climb.nominalClimbFpm`
    - `descent_vs_concas()` -> `arrival.nominalDescentFpm` and `enroute.nominalDescentFpm`
    - `finalapp_vs()` -> `approach.nominalDescentFpm` and `landing.nominalDescentFpm`
  - Accelerations (m/s² converted to kt/s via `abs(val) * 1.94384`):
    - `takeoff_acceleration()` -> `initialClimb.accelKtPerS` and `climb.accelKtPerS`
    - `landing_acceleration()` -> `approach.decelKtPerS` and `landing.decelKtPerS`
  - Speeds (m/s converted to kt via `m/s * 1.94384`):
    - `initclimb_vcas()` -> `initialClimb.minSpeedKt` / `maxSpeedKt`
    - `climb_const_vcas()` -> `climb.minSpeedKt` / `maxSpeedKt`
    - `descent_const_vcas()` -> `arrival.minSpeedKt` / `maxSpeedKt`
    - `finalapp_vcas()` -> `approach.minSpeedKt` / `maxSpeedKt`
    - `landing_speed()` -> `landing.minSpeedKt` / `maxSpeedKt`
- Unit conversion constants:
  - `M_TO_FT = 3.280839895`
  - `MPS_TO_KT = 1.9438444924406048`
  - `MPS_TO_FPM = 196.8503937007874`
- Target file: `src/core/performance/aircraft-profiles.json`

## Scope

- Refactor `tools/aircraft-profiles/build_profiles.py`:
  - Open and parse `src/core/performance/aircraft-profiles.json`.
  - Iterate through keys in the `"aircraft"` dictionary.
  - Query OpenAP directly:
    - `openap.prop.aircraft(icao)`:
      - `maxControlledSpeedKt`: from `vmo` (knots).
      - `serviceCeilingFt`: from `ceiling` in meters, converted to feet (`meters * 3.280839895`).
    - `openap.kinematic.WRAP(icao)`:
      - Vertical rates (m/s -> fpm via `abs(val) * 196.8504`):
        - `initclimb_vs()` -> `initialClimb.nominalClimbFpm`
        - `climb_vs_concas()` -> `climb.nominalClimbFpm`
        - `descent_vs_concas()` -> `arrival.nominalDescentFpm` and `enroute.nominalDescentFpm`
        - `finalapp_vs()` -> `approach.nominalDescentFpm` and `landing.nominalDescentFpm`
      - Accelerations (m/s² -> kt/s via `abs(val) * 1.94384`):
        - `takeoff_acceleration()` -> `initialClimb.accelKtPerS` and `climb.accelKtPerS`
        - `landing_acceleration()` -> `approach.decelKtPerS` and `landing.decelKtPerS`
      - Speeds (m/s -> kt via `val * 1.94384`):
        - `initclimb_vcas()` -> `initialClimb.minSpeedKt` / `maxSpeedKt`
        - `climb_const_vcas()` -> `climb.minSpeedKt` / `maxSpeedKt`
        - `descent_const_vcas()` -> `arrival.minSpeedKt` / `maxSpeedKt`
        - `finalapp_vcas()` -> `approach.minSpeedKt` / `maxSpeedKt`
        - `landing_speed()` -> `landing.minSpeedKt` / `maxSpeedKt`
  - Write populated fields directly under `aircraft[icao]` with `"source": "openap"`.
  - If OpenAP has no data or an alias fails for a type, leave the object as `{}` with a warning, allowing runtime defaults to handle it.
  - Format output JSON deterministically (2-space indent, sorted keys).
  - Support `--check` (fails with non-zero exit code if disk content differs from calculated output).
  - Support `--types <icao>` to optionally limit population to specific types.
- Update `tools/aircraft-profiles/test_build_profiles.py` to test:
  - Direct reading and in-place updating of the JSON structure.
  - Mocked OpenAP responses verifying correct unit conversions:
    - meters to feet for service ceiling (`* 3.280839895`).
    - m/s to fpm for vertical speeds (`abs(val) * 196.8504`).
    - m/s² to kt/s for accel/decel (`abs(val) * 1.94384`).
    - m/s to kt for regime speeds (`* 1.94384`).
  - Verification of mappings across all populated regimes (`initialClimb`, `climb`, `enroute`, `arrival`, `approach`, `landing`).
  - `--check` flag reporting changes accurately.

## Out of scope

- Modifying TypeScript runtime files (handled in T04-60 and T04-62).
- Deleting legacy mapping and policy files (handled in T04-62).
- Downloading online data at runtime (build-time offline only).

## Contract Table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `python3 tools/aircraft-profiles/build_profiles.py` | Populates `aircraft` entries in `aircraft-profiles.json` from OpenAP with converted ceiling (ft), full regime speeds, vertical rates, and accelerations | Updates `aircraft-profiles.json` in place | Unknown OpenAP type logs warning, leaves `{}` | `test_build_profiles.py` |
| `python3 tools/aircraft-profiles/build_profiles.py --check` | Compares generated content to file on disk | Exit 0 on match; no file writes | Exit 2 if content differs | CLI exit code |
| `python3 tools/aircraft-profiles/build_profiles.py --types B738` | Restricts population to specified ICAO type | Updates only `aircraft.B738` in file | Type not in `aircraft` dictionary logs error | CLI exit code |
| `openap.prop.aircraft(icao)['ceiling']` = 12500 m | Converts 12,500 m to ~41,010 ft in `limits.serviceCeilingFt` | Valid ceiling in feet | Non-numeric ceiling skipped | `test_build_profiles.py` |
| `wrap.descent_vs_concas()` = -12.5 m/s | Converts to `nominalDescentFpm`: ~2460.6 fpm on arrival and enroute regimes | Sets `nominalDescentFpm` | Missing method leaves field to default cascade | `test_build_profiles.py` |
| `wrap.takeoff_acceleration()` = 1.2 m/s² | Converts to `accelKtPerS`: ~2.33 kt/s on initialClimb and climb regimes | Sets `accelKtPerS` | Missing method leaves field to default cascade | `test_build_profiles.py` |

## Acceptance criteria

- [ ] **AC1 — Direct population:** Running `build_profiles.py` reads `src/core/performance/aircraft-profiles.json` and updates `aircraft` entries directly.
- [ ] **AC2 — Ceiling unit conversion:** Ceiling values from `openap.prop.aircraft` (in meters) are converted to feet via `meters * 3.280839895` and stored under `limits.serviceCeilingFt` (e.g. 12,500 m becomes ~41,010 ft, not 12,500 ft).
- [ ] **AC3 — Vertical speed kinematics:** Populated aircraft receive `nominalDescentFpm` from `descent_vs_concas()` (`arrival` and `enroute`) and `finalapp_vs()` (`approach` and `landing`) converted via `abs(val) * 196.8504`, alongside existing climb vertical speeds (`initclimb_vs` and `climb_vs_concas`).
- [ ] **AC4 — Acceleration kinematics:** Populated aircraft receive `accelKtPerS` from `takeoff_acceleration()` (`initialClimb` and `climb`) and `decelKtPerS` from `landing_acceleration()` (`approach` and `landing`) converted via `abs(val) * 1.94384`.
- [ ] **AC5 — Regime speed ranges:** Populated aircraft receive `minSpeedKt` and `maxSpeedKt` across all applicable regimes: `initclimb_vcas` (`initialClimb`), `climb_const_vcas` (`climb`), `descent_const_vcas` (`arrival`), `finalapp_vcas` (`approach`), and `landing_speed` (`landing`) converted via `m/s * 1.94384`.
- [ ] **AC6 — Fallback tolerance:** Aircraft types without OpenAP records remain valid empty objects `{}` without failing the build.
- [ ] **AC7 — Deterministic output:** Repeated runs without data changes produce identical file output. `--check` succeeds when up to date.
- [ ] **AC8 — Test suite:** `test_build_profiles.py` passes with mocked OpenAP calls, verifying ceiling conversion to feet, vertical rates, accelerations, and speed extractions across regimes.

## Test plan

- **Unit:** `python3 -m unittest discover -s tools/aircraft-profiles -p 'test_*.py'` passes cleanly.
- **Check:** `python3 tools/aircraft-profiles/build_profiles.py --check` succeeds against the committed file.

## Suggested files

- `tools/aircraft-profiles/build_profiles.py`
- `tools/aircraft-profiles/test_build_profiles.py`
- `src/core/performance/aircraft-profiles.json`
