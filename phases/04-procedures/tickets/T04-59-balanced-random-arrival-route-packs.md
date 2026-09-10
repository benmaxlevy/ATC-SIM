# T04-59 Balanced random arrival route packs

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** S
**Depends on:** T04-58
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

A random initial-arrival pack uses the scenario-declared route pool fairly.
It must not stack every initial track onto a single STAR/transition merely
because that slot won the first seeded draw.

## Scope

- Replace the primary-slot stacking policy with deterministic seeded traversal
  of a supplied route pool: use each eligible route once before repeating.
- Preserve seed reproducibility, route-pool restrictions, entry fixes,
  in-trail spacing, and later-route randomness after one full traversal.
- Add a synthetic route-pool test and one KATL initial-pack acceptance proving
  a six-track pack uses more than one declared STAR/transition.

## Non-goals

- No procedure/data expansion, camera/UI change, changing entry geometry,
  departure scheduling, callsign/aircraft policy, or facility branch.

## Acceptance criteria

- [ ] A route pool with N distinct entries uses each entry once before any
  repetition when count is at least N.
- [ ] Same seed gives the same ordered assignments; a different seed may vary
  order but cannot collapse an initial six-entry KATL pool to one route.
- [ ] Every generated assignment remains a declared route/entry fix and
  preserves valid inbound pose/spacing.
- [ ] `npm run ci` passes.

## Suggested files

- `src/scenario/starSpawn.ts`
- `src/scenario/test/starSpawn.test.ts`
- `src/scenario/test/facilityScenario.test.ts`
