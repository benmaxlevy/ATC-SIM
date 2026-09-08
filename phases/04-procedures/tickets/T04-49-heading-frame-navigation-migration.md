# T04-49 Heading-frame navigation migration

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** XL
**Depends on:** T04-48
**Blocks:** T04-50
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Use true headings for every ENU calculation while retaining magnetic controller
commands, published courses, speech, and aircraft display values.

## Context

T04-48 supplies `World.magVarDeg`, named conversion helpers, and unambiguous
frames. Current kinematics uses `Aircraft.headingDeg` directly for ENU motion;
FMS direct/procedure bearings return true geometry as command headings;
localizer has one ambiguous `courseDeg`; PTL and alert velocity projections use
magnetic headings as though true. This ticket closes every behavior path.

## Scope

- Convert aircraft magnetic heading to true heading before ENU x/y movement.
  Turn physics and controller-facing stored/displayed heading remain magnetic.
- Compute direct-to and procedure-leg bearings in true ENU geometry, then
  convert those bearing targets to magnetic before assigning controller/pilot
  heading mode. Include fly-by/last-leg behavior and missed geometry where it
  shares the same boundary.
- Make each LOC axis retain both published magnetic command course and true
  geometric course. Localizer deviation, lead turn, signed cross-track,
  capture/tracking, runway alignment, and GS consume the true axis; FMS heading
  targets convert true guidance back to magnetic.
- Make GS distance/height geometry consume the true LOC axis only.
- Make PTL and every predicted motion vector used by conflict alert/ATPA use
  true heading. Preserve magnetic values in controller/scope aircraft state.
- Migrate tests to explicit frames. Reusable tests must use synthetic airports
  at `0`, `+5`, and `-5` degrees, including reciprocal axes. Committed KDEM or
  KATL data may be asserted only in their feature acceptance tests.
- Preserve KDEM zero-variation behavior exactly, controller phraseology, APP
  LOC-first/GS-from-below semantics, rate-limited lead capture, and no
  facility-specific branch.

## Out of scope

- New heading command grammar, altered readback phraseology, wind/crab,
  envelope redesign, runway/map-art changes, CIFP changes, or a new scenario.
- KATL scenario acceptance ownership; T04-50 owns that regression after this
  generic migration is merged.

## Acceptance criteria

- [ ] **AC1 -- Motion:** Synthetic aircraft commanded magnetic headings at
  `0`, `+5`, and `-5` variations move along the corresponding true ENU vectors;
  zero variation remains bit-for-bit compatible within existing tick tolerance.
- [ ] **AC2 -- Direct/procedure:** Parameterized direct-to and procedure legs
  calculate true bearings then command equivalent magnetic headings. Include
  reciprocal legs and fly-by/last-leg edges; no facility/id/compass-side branch.
- [ ] **AC3 -- LOC/GS:** A LOC axis exposes magnetic published course and true
  geometric course. Parameterized reciprocal `0`, `+5`, `-5` axes capture and
  track with bounded cross-track error, do not fly through centerline, and GS
  captures only LOC-first/from below using the true axis.
- [ ] **AC4 -- PTL/prediction:** PTL endpoint, conflict CPA prediction, and
  ATPA projected arrival geometry use true motion vectors under plus/minus
  variation. A test fails if magnetic heading is projected directly as ENU.
- [ ] **AC5 -- Controller contract:** `FLY_HEADING`, parser/speech/readback,
  aircraft displayed heading, and published procedure course remain magnetic.
  KATL-style `magVarDeg: -5`, command `275`, tracks true `270`.
- [ ] **AC6 -- Regression:** KDEM at zero variation retains current direct,
  procedure, localizer, GS, PTL, CA, and ATPA behavior; existing event and
  heading-cancels-APP semantics remain.
- [ ] **AC7 -- Automated:** Focused DOM-free navigation, alert, and prediction
  tests pass. Generic suites do not assert production catalog counts/geometry.

## Test plan

- **Unit:** true/magnetic motion vectors; DCT/procedure bearing conversion;
  reciprocal LOC axes; true GS axis; PTL/CA/ATPA prediction helpers.
- **Integration:** parameterized synthetic worlds for `0`, `+5`, `-5`, both
  sides/reciprocal runways, LOC capture/tracking/GS, and CA/ATPA.
- **Regression:** existing KDEM approach and alert flows at zero variation.
- **Manual:** None; T04-50 owns scenario acceptance.

## Suggested files

- `src/core/kinematics.ts`
- `src/core/nav/geometry.ts`
- `src/core/nav/localizer.ts`
- `src/core/nav/glidepath.ts`
- `src/core/fms/lateral.ts`
- `src/core/fms/vertical.ts`
- `src/core/alerts/conflictAlert.ts`
- `src/core/alerts/atpa.ts`
- `src/scope/ptl.ts`
- `src/scope/trackDisplay.ts`
- `src/core/{nav,fms,alerts}/test/*`
- `src/core/test/world.ca.test.ts`
- `src/core/test/world.atpa.test.ts`
- `src/scope/test/atpaFidelity.integration.test.ts`

