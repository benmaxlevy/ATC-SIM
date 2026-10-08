# T04-77 VFR training box replaces named zones

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-76
**Blocks:** T04-78
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start T04-78 or UI work.

## Goal

Ambient VFR spawns uniformly inside one fixed training box instead of named
scenario zones. Zone configuration, validation, and geometry are deleted from
the VFR pipeline. Seeded streams, Bravo avoidance, missions, and request
scheduling are unchanged.

## Context

`katl.json` / `katl-08.json` are the only scenarios carrying `vfrZones`, and
they exist only because the spawner no-ops without zones
(`spawnOneVfrAircraft` returns null on empty `config.zones`). Named zones add
authoring burden and UI weight for no trainer benefit. A uniform box plus the
existing avoidance guard covers the same training need. See
`phases/04-procedures/README.md` post-exit addendum and T04-71.

## Research

- **T04-71 contract:** independent seeded streams, Bravo swept-segment
  avoidance, `vfr.spawn.skipped` with `NO_SAFE_ROUTE`. No change here.
- Trainer delta: uniform spatial distribution replaces weighted geographic
  distribution; workload shaping moves to density presets (T04-78).

## Scope

- Add one exported constant (e.g. `VFR_TRAINING_HALF_EXTENT_NM = 30`) and
  sample spawn/LOCAL waypoints uniformly in `[-half, +half]` around the
  scenario ARP using the existing placement RNG stream.
- Change `planSafeVfrRoute` to take the box (drop the `zone` parameter or
  accept a caller-built box geometry). TRANSIT and AIRPORT_BOUND logic
  unchanged; LOCAL samples the box.
- Delete from `VfrTrafficManager`: the `zones` map, zone-config validation,
  zone selection, and the empty-zones null return.
- Delete `VfrTrafficZoneConfig`, `VfrZone`, `Scenario.vfrZones`,
  `VfrTrafficConfig.zones`, `parseVfrZones`, and zone validation in
  `validateVfrTrafficConfig`. Enabled traffic no longer requires zones.
- Delete `samplePointInZone` (or reduce it to the box sampler if callers
  remain). Keep `ZoneGeometry` only if another live caller needs it;
  otherwise delete.
- Remove `vfrZones` from `katl.json` and `katl-08.json`.
- Update `defaultVfrTrafficConfigForScenario` to omit zones.
- Rewrite zone unit tests to box-uniform distribution, seed repeatability,
  and unchanged legacy-IFR-stream identity. Keep Bravo/prism tests.

## Out of scope

- UI changes (T04-78 owns presets, tune dropdown, zone fieldset removal).
- Movement mix, request percentages, aircraft/altitude mixes.
- New missions, Bravo clearance, tower behavior, speech, Command IR.
- Changing avoidance margins, planner attempts, or skip-event shape.

## Implementation notes

- Box sampling must use the existing `rngPlacement`/`rngRoute` streams in the
  same call order shape so legacy IFR draws stay identical for a fixed seed.
- Spawns inside Bravo are excluded by the existing guard, not by box shaping.
  If the skip rate is visibly high at 3000–5500 ft, note it for T04-78 manual
  review; do not reshape the box silently in this ticket.
- Keep `getEligibleVfrDestinations` and airport-bound flow untouched.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `{ initialCount: 4 }`, no zones key | 4 VFR spawn uniformly in box | Ambient VFR/1200 markers, persistent routes | Planner failures emit `vfr.spawn.skipped`, never throw | Seeded-box unit test |
| Config with legacy `zones` key | Ignored (unknown keys pass through) or exact validation error per implementation | No zone-weighted behavior exists | No silent zone weighting | Unit test |
| Same seed twice | Identical spawn poses/callsigns | Deterministic replay | Legacy IFR schedule identical to pre-change seed | Stream-identity test |
| Spawn candidate inside Bravo | Candidate rejected, next attempt | No penetration, no teleport | Bounded attempts then skip event | Existing prism tests |

## Acceptance criteria

- [ ] No `vfrZones`/`zones` references remain in VFR spawn/validate/plan paths.
- [ ] Non-zero initial count spawns without any zone authoring on KATL.
- [ ] Seed repeatability and legacy IFR-stream identity hold.
- [ ] `npm run ci` passes.

## Test plan

- Unit: `src/scenario/test/vfrTraffic.test.ts` box distribution, repeatability,
  no-zone enabled config, skip accounting.
- Unit: `src/core/test/vfrNavigation.test.ts` box sampling through existing
  avoidance tests.
- Integration: KATL spawn smoke with 4 initial VFR, all outside Bravo.
- Manual: KATL west flow seeded session, scope walk of uniform spread.

## Suggested files

- `src/scenario/vfrTraffic.ts`
- `src/scenario/types.ts`
- `src/scenario/load.ts`
- `src/scenario/sessionSetup.ts`
- `src/core/vfrNavigation.ts`
- `src/scenario/katl.json`, `src/scenario/katl-08.json`
- `src/scenario/test/vfrTraffic.test.ts`
- `tests/integration/vfr-population.test.ts`

## Test and handoff requirements

Focused tests then `npm run ci`. Never skip hooks. Stage explicit owned
paths only. Worker implements exactly this ticket on
`ticket/T04-77-vfr-training-box-replaces-zones`, progressive gated commits,
never merges/spawns/pushes, returns exactly `READY TO MERGE` or `BLOCKED`.
