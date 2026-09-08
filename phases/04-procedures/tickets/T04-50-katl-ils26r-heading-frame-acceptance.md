# T04-50 KATL ILS 26R heading-frame acceptance

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-49
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Prove the generic heading-frame migration in the shipped KATL ILS 26R scenario:
controller clear/fly heading is magnetic `275`; aircraft follows true `270`
runway/localizer geometry without visible localizer fly-through.

## Context

KATL already ships generic catalog/scenario data: `magVarDeg: -5`, 26R true
runway heading `270`, and I26R published magnetic course `275`. The scenario
is the production-level counterexample to KDEM's 0-degree variation. T04-49
owns all behavior; this ticket owns only black-box scenario acceptance and the
KDEM non-regression proof.

## Scope

- Add one scenario-level I26R regression using generic scenario/catalog loading
  and the normal controller/pilot/world path. Do not construct a KATL-only
  navigation path or mutate production data to fit the test.
- Clear/fly I26R with magnetic `H275` (or exact normal equivalent), then prove
  displayed/assigned heading and published course remain `275` while geometric
  runway/LOC tracking is true `270`.
- Prove bounded cross-track capture with no centerline-sign change/fly-through,
  exactly one LOC capture lifecycle, and LOC-before-GS/from-below behavior.
- Assert PTL plus CA/ATPA prediction use the same true-motion frame in the KATL
  world. Keep detailed synthetic matrices in T04-49; this is one scenario-level
  wiring regression.
- Retain a KDEM ILS 27 zero-variation acceptance proving headings/tracks remain
  `270` and legacy intercept/GS behavior is unchanged.

## Out of scope

- Conversion helpers, general kinematics/FMS/alerts changes, new KATL data,
  map changes, parser/readback wording, visual Chrome sign-off, or manual FAA
  chart validation.

## Acceptance criteria

- [ ] **AC1 -- Generic KATL load:** `assertScenario` / catalog / world creation
  loads KATL without airport branches and exposes `magVarDeg === -5`, I26R
  published magnetic course `275`, and 26R true geometry `270`.
- [ ] **AC2 -- Magnetic controller surface:** Normal clear/fly input `H275`
  remains magnetic in command intent, readback, and displayed aircraft heading.
- [ ] **AC3 -- True final:** The I26R aircraft moves/tracks on true `270` LOC
  geometry, captures once with bounded cross-track error before any sign change,
  reaches stable inbound tracking, and has no visible LOC fly-through/re-arm.
- [ ] **AC4 -- GS and prediction:** GS remains LOC-first/from below on the true
  axis. PTL and a representative CA/ATPA prediction in this world follow true,
  not raw magnetic, ENU vectors.
- [ ] **AC5 -- Reciprocal guard:** One synthetic reciprocal-axis assertion
  accompanies the scenario test to catch variation sign/reversal errors without
  hard-coding another production airport.
- [ ] **AC6 -- KDEM non-regression:** Existing KDEM ILS 27 acceptance still
  uses `magVarDeg === 0`; controller/display/true track all remain `270` and
  LOC/GS completion remains unchanged.
- [ ] **AC7 -- Automated:** Scenario-level tests pass with no Chrome-only
  assertion. Production KATL geometry/ids appear only in this acceptance file.

## Test plan

- **Acceptance:** Extend or add one Phase 4 scenario integration file beside
  existing dual-runway/facility tests; use I26R clear/fly/capture/GS lifecycle.
- **Regression:** KDEM ILS 27 zero-variation full approach in the same feature
  acceptance file.
- **Manual:** Optional human `npm run dev` KATL west-flow observation; do not
  claim a visual pass without an operator.

## Suggested files

- `src/scenario/test/dualRunwayIntegration.test.ts`
- `src/scenario/test/facilityScenario.test.ts`
- `src/core/fms/test/approach.test.ts`
- `src/scope/test/atpaFidelity.integration.test.ts`
- `src/scenario/katl.json`
- `src/scenario/data/katl/{catalog,procedures,ils,atpa-volumes}.json`

