# T04-61 Direct OpenAP aircraft profile populator

**Phase:** 04 Procedures
**Priority:** P1
**Size:** M
**Depends on:** T04-60
**Blocks:** T04-62
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Rewrite `tools/aircraft-profiles/build_profiles.py` into a direct, single-file populator that reads `src/core/performance/aircraft-profiles.json`, directly queries OpenAP (`openap.prop.aircraft` and `openap.kinematic.WRAP`), and writes populated overrides with `"source": "openap"`.

## Context

The previous generator relied on three files (`simulator-policies.json`, `type-mappings.json`, and `aircraft-profiles.generated.json`) with an abstract JSON recipe format. T04-60 unified the dataset into `src/core/performance/aircraft-profiles.json`.

This ticket simplifies `build_profiles.py` to operate directly on the unified JSON file, calling OpenAP directly for populated airframes rather than routing through policy indirection.

## Research

- OpenAP aircraft metadata: `openap.prop.aircraft(icao)` (`vmo`, `ceiling`)
- OpenAP WRAP kinematics: `openap.kinematic.WRAP(icao)`:
  - `climb_vs_concas()` -> climb vertical speed (fpm)
  - `finalapp_vcas()` -> final approach speed (kt)
  - `initclimb_vs()` -> initial climb vertical speed (fpm)
- Target file: `src/core/performance/aircraft-profiles.json`

## Scope

- Refactor `tools/aircraft-profiles/build_profiles.py`:
  - Open and parse `src/core/performance/aircraft-profiles.json`.
  - Iterate through keys in the `"aircraft"` dictionary.
  - Query OpenAP directly:
    - `openap.prop.aircraft(icao)` for `maxControlledSpeedKt` (`vmo`) and `serviceCeilingFt` (`ceiling`).
    - `openap.kinematic.WRAP(icao)` for `climb.nominalClimbFpm` (`climb_vs_concas`), `approach.minSpeedKt` / `maxSpeedKt` (`finalapp_vcas`), and `initialClimb.nominalClimbFpm` (`initclimb_vs`).
  - Write populated fields directly under `aircraft[icao]` with `"source": "openap"`.
  - If OpenAP has no data or an alias fails for a type, leave the object as `{}` with a warning, allowing runtime defaults to handle it.
  - Format output JSON deterministically (2-space indent, sorted keys).
  - Support `--check` (fails with non-zero exit code if disk content differs from calculated output).
  - Support `--types <icao>` to optionally limit population to specific types.
- Update `tools/aircraft-profiles/test_build_profiles.py` to test:
  - Direct reading and in-place updating of the JSON structure.
  - Mocked OpenAP responses correctly converting SI to aviation units (m/s to kt and fpm).
  - `--check` flag reporting changes accurately.

## Out of scope

- Modifying TypeScript runtime files (handled in T04-60).
- Deleting legacy mapping and policy files (handled in T04-62).
- Downloading online data at runtime (build-time offline only).

## Contract Table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `python3 tools/aircraft-profiles/build_profiles.py` | Populates `aircraft` entries in `aircraft-profiles.json` from OpenAP | Updates `aircraft-profiles.json` in place | Unknown OpenAP type logs warning, leaves `{}` | `test_build_profiles.py` |
| `python3 tools/aircraft-profiles/build_profiles.py --check` | Compares generated content to file on disk | Exit 0 on match; no file writes | Exit 2 if content differs | CLI exit code |
| `python3 tools/aircraft-profiles/build_profiles.py --types B738` | Restricts population to specified ICAO type | Updates only `aircraft.B738` in file | Type not in `aircraft` dictionary logs error | CLI exit code |

## Acceptance criteria

- [ ] **AC1 — Direct population:** Running `build_profiles.py` reads `src/core/performance/aircraft-profiles.json` and updates `aircraft` entries directly.
- [ ] **AC2 — OpenAP fields:** Populated aircraft entries receive `"source": "openap"`, `limits.maxControlledSpeedKt`, `limits.serviceCeilingFt`, and WRAP climb/approach speed values where available.
- [ ] **AC3 — Fallback tolerance:** Aircraft types without OpenAP records remain valid empty objects `{}` without failing the build.
- [ ] **AC4 — Deterministic output:** Repeated runs without data changes produce identical file output. `--check` succeeds when up to date.
- [ ] **AC5 — Test suite:** `test_build_profiles.py` passes with mocked OpenAP calls, proving SI conversions and `--check` behavior.

## Test plan

- **Unit:** `python3 -m unittest discover -s tools/aircraft-profiles -p 'test_*.py'` passes cleanly.
- **Check:** `python3 tools/aircraft-profiles/build_profiles.py --check` succeeds against the committed file.

## Suggested files

- `tools/aircraft-profiles/build_profiles.py`
- `tools/aircraft-profiles/test_build_profiles.py`
- `src/core/performance/aircraft-profiles.json`
