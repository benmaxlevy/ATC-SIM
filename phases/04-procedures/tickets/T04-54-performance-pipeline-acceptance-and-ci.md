# T04-54 Performance pipeline acceptance and CI

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-53
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The committed profile artifact, offline generator, and profile-driven simulator
have reproducible gates and one focused end-to-end acceptance seam.

## Context

T04-51 through T04-53 establish tool, data, registry, and consumption. This
ticket owns verification only; it does not introduce new model behavior.

## Scope

- Add CI-safe Python setup and generator check using pinned dependencies; no
  data download occurs during the check after dependency installation.
- Add a package command that validates committed generated JSON against the
  generator for the initial preset.
- Add generic parameterized tests with minimal synthetic profiles; cover turn,
  climb, descent, acceleration, deceleration, regime transitions, target
  capture, and unknown fallback.
- Add one production-data contract test for every initial preset ICAO key:
  one record, explicit status, valid provenance, selected variant/engine, and
  valid limits. Do not assert values, ordering, or geometry.
- Add one black-box world acceptance using two supported shipped types and one
  unknown/default type. It proves normal scenario/pilot/world wiring consumes
  profile data without facility-specific behavior.
- Document local reproduce commands, artifact review workflow, unresolved-type
  policy, license/provenance review, and manual simulator smoke check.

## Out of scope

- New source datasets, changed profile policy, profile-aware alerts, browser
  telemetry, visual performance dashboards, or a second aircraft-model system.

## Acceptance criteria

- [ ] **AC1 — Reproducible gate:** Fresh pinned Python environment runs profile
  generation/check for `terminal-v1`; generated artifact has no diff.
- [ ] **AC2 — Arbitrary set guard:** A non-preset valid `--types` invocation is
  exercised in test and does not alter initial-preset configuration.
- [ ] **AC3 — Generic tests:** Synthetic matrix covers all profile-controlled
  motion dimensions and all generic regimes without production ICAO/map data.
- [ ] **AC4 — Data contract:** Every initial ICAO has exactly one valid emitted
  profile status with nonempty selected variant/engine/provenance; no committed
  production number is asserted as generic behavior.
- [ ] **AC5 — World acceptance:** Two supported types differ in at least one
  observed profile-driven trajectory; unknown type follows default; parser and
  pilot ownership remain unchanged.
- [ ] **AC6 — Regression:** `npm run ci` and Python generator tests pass. If
  `speech-api/` changes, its mock pytest gate also passes; otherwise it is not
  run merely for this ticket.
- [ ] **AC7 — Documentation:** README describes offline-only build, command
  inputs, initial preset, source/policy provenance, OpenAP licensing review,
  and no runtime dependency.

## Test plan

- **Unit:** Generator check and synthetic profile matrix.
- **Integration:** Profile registry plus normal world/pilot path.
- **Manual:** Run generated-data report and inspect one profile diff before
  release; optional browser smoke test.

## Suggested files

- `.github/workflows/ci.yml`
- `package.json`
- `tools/aircraft-profiles/`
- `src/core/performance/`
- `src/core/test/`
- `phases/04-procedures/README.md`
