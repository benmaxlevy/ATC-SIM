# T04-57 Scenario random route pools and boot defaults

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-56
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

Every playable scenario owns the eligible arrival STAR and departure SID route
pools used by `random` traffic. A clean browser boot uses that scenario's
traffic configuration; it must not silently replace it with global/session
fallbacks.

## Scope

- Make the existing scenario arrival rows the explicit eligible STAR-route pool
  for `spawnPolicy: "random"`. A random playable row must identify a valid
  `starId` and `transitionId`; its pose remains authored-only data.
- Add a typed, explicit random-departure route pool to `departureConfig`,
  distinct from scheduled authored departures. Random scheduling samples only
  this scenario pool, validates its SID/transition/runway compatibility, and
  retains deterministic valid airline/type allocation.
- Populate KDEM and both KATL flow configurations with valid route pools for
  their active runway. Do not synthesize routes from every facility procedure.
- Resolve first-load session traffic from the selected scenario's defaults,
  including its configured departure rate. Persisted user setup and explicit
  URL overrides retain their documented precedence. A zero configured rate
  remains an intentional off state.
- Add focused scenario/world tests proving clean KDEM and KATL boot spawn the
  configured initial arrivals and schedule only declared STAR/SID routes.

## Non-goals

- No live airline/route data, timetable, airport branch, parser/UI redesign,
  new procedure import, changes to OpenAP profiles, or compatibility aliases.
- No random selection from undeclared catalog STARs/SIDs.

## Acceptance criteria

- [ ] A `random` scenario rejects missing/invalid arrival route-pool entries;
  each generated initial/future arrival uses one declared STAR transition.
- [ ] A random departure configuration rejects missing/invalid route-pool
  entries; every scheduled departure uses one declared compatible SID route.
- [ ] Clean `http://localhost:5173/` boot produces its configured initial
  arrivals; selected scenario defaults enable/configure departures as authored
  by that scenario.
- [ ] Stored session values and valid URL overrides still win over scenario
  defaults; explicit zero rates disable only their respective stream.
- [ ] KDEM, KATL west flow, and KATL east flow have route pools compatible
  with their active runway. Same seed remains deterministic and all generated
  airline/type pairs remain valid.
- [ ] `npm run ci` passes.

## Suggested files

- `src/scenario/{types,load,arrivalScheduler,departureGenerator,spawn,sessionSetup}.ts`
- `src/main.tsx`
- `src/scenario/{kdem,kdem-09,katl,katl-08}.json`
- `src/scenario/test/` and `tests/integration/`
