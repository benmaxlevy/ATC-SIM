# T04-58 Random arrival entry fixes

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-57
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

Random scenario arrivals begin at an explicit, scenario-declared fix on their
declared STAR, instead of unconditionally at the distant first transition fix.
Initial arrivals must be visible and inbound in the terminal scope.

## Scope

- Extend the random arrival route-pool entry with a required STAR entry fix.
  Validate that it belongs to the declared transition/common STAR route.
- Make STAR pose generation begin immediately before that entry fix and arm the
  remaining route from that fix onward. Do not fly back to an earlier fix.
- Populate KATL west/east route pools with terminal entry fixes that are within
  the normal display/terminal area; retain deterministic route selection.
- Populate KDEM random route pools explicitly under the same contract.
- Add focused route geometry/world tests: an explicit entry starts inbound to
  that fix, omits preceding legs, and validates malformed/non-route entries.

## Non-goals

- No camera auto-range/pan, facility branch, chart import, live traffic,
  departure behavior change, parser/UI change, or arbitrary coordinate spawn.

## Acceptance criteria

- [ ] Every random arrival row declares a valid `entryFixId`; missing or
  non-route entry fixes reject at scenario load.
- [ ] Initial KATL random arrivals exist and spawn inbound to declared terminal
  entry fixes inside the standard 60 NM terminal display area.
- [ ] The active route begins at the entry fix; no aircraft reverses toward a
  discarded outer transition leg.
- [ ] Same seed remains deterministic; scenario route-pool restrictions and
  airline/type pairing persist.
- [ ] Generic synthetic tests cover entry selection/validation; one KATL
  acceptance checks its shipped terminal visibility contract. `npm run ci`
  passes.

## Suggested files

- `src/scenario/{types,load,starSpawn,arrivalScheduler,spawn}.ts`
- `src/scenario/{kdem,kdem-09,katl,katl-08}.json`
- `src/scenario/test/`
