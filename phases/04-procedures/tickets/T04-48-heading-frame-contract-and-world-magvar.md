# T04-48 Heading-frame contract and world magnetic variation

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-47
**Blocks:** T04-49, T04-50
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make heading reference frames explicit in types and core world context. Controller
inputs and published procedure courses are magnetic; ENU geometry is true:
`true = magnetic + magVarDeg`.

## Context

`Scenario.magVarDeg` and `ProcedureCatalog.magVarDeg` already exist, but the
world drops the value and current `headingDeg` / `courseDeg` names let commands
and geometry silently share one value. KDEM is zero variation by data, not a
global coordinate-system rule. KATL already declares `magVarDeg: -5` and
published ILS 26R course `275` for true runway geometry `270`.

## Scope

- Publish the heading-frame contract in Phase 4 architecture documentation and
  code comments next to the canonical helpers/types.
- Add named `MagneticHeadingDeg` and `TrueHeadingDeg` types (or equally strict
  typed names consistent with repository conventions), plus
  `magneticToTrueDeg(magneticDeg, magVarDeg)` and
  `trueToMagneticDeg(trueDeg, magVarDeg)`. Both normalize to `[0, 360)`.
- Carry generic catalog/scenario `magVarDeg` into the core `World` navigation
  context used by tick, FMS, alerts, and scope prediction. Do not add a KDEM or
  KATL conditional.
- Make typed/catalog names distinguish published magnetic course from true
  geometric axis. At the core navigation boundary, no field named only
  `courseDeg` may represent an unspecified frame. Preserve a deliberate loader
  compatibility adapter only if existing fixture migration needs one; it must
  name its input/output frame and be removed once all committed data is clear.
- Keep `Aircraft.headingDeg`, command/parser/speech/readback, assigned heading,
  and displayed heading magnetic. Keep ENU bearing helpers, runway/map lines,
  and geometric axis values true.
- Add small synthetic `0`, `+5`, and `-5` degree variation coverage. This
  ticket establishes types/plumbing/conversions only; T04-49 migrates motion
  and navigation behavior.

## Out of scope

- Kinematics, FMS guidance, localizer/glidepath math, PTL, CA, ATPA, or visible
  intercept behavior; T04-49 owns those migrations.
- Parser grammar, phraseology, wind/crab, CIFP importer changes, map-art
  conversion, new facilities, or a facility branch.

## Acceptance criteria

- [ ] **AC1 -- Contract:** Documentation and canonical source state exactly:
  commands/parser/speech/displayed aircraft heading/published procedure courses
  are magnetic; ENU x/y, runway/map lines, LOC/GS, PTL/prediction, and alert
  geometry are true; `true = magnetic + magVarDeg`.
- [ ] **AC2 -- Conversions:** Named helpers are exported from the shared core
  boundary, normalize wraparound, and prove `0`, `+5`, and `-5` variation plus
  round-trip conversion with table-driven unit tests.
- [ ] **AC3 -- World plumbing:** Worlds created from generic scenarios retain
  catalog/scenario `magVarDeg`; KDEM proves `0`, KATL proves `-5`, and a
  synthetic `+5` catalog proves no airport-id branch.
- [ ] **AC4 -- Typed names:** Command/published magnetic fields and ENU true
  axis/bearing fields have unambiguous names/types. No new ambiguous bare
  `courseDeg` crosses a command/geometry boundary.
- [ ] **AC5 -- External interface:** Existing command tokens, speech/readback,
  and displayed aircraft heading remain magnetic. At zero variation existing
  values are unchanged.
- [ ] **AC6 -- Automated:** Focused unit/scenario tests pass without DOM or
  KDEM-only reusable fixtures.

## Test plan

- **Unit:** conversion normalization and inverse properties for `0`, `+5`,
  `-5`; typed catalog-to-world navigation context.
- **Integration:** generic scenario loading at each variation; KDEM/KATL prove
  committed data wiring once.
- **Manual:** None.

## Suggested files

- `src/core/nav/headingFrames.ts`
- `src/core/world.ts`
- `src/core/index.ts`
- `src/scenario/types.ts`
- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/spawn.ts`
- `src/core/nav/test/headingFrames.test.ts`
- `src/scenario/test/facilityScenario.test.ts`
- `phases/04-procedures/README.md`

