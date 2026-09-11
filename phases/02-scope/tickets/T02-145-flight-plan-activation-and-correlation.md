# T02-145 Active flight-plan association and correlation

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-143, T02-144
**Blocks:** T02-147
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make pending plans activate and associate to tracks through unique squawk
correlation or explicit `INIT CNTL` target selection.

## Context

TI 6191.409 Rev. 30 §5.4.1 and §5.5.8 distinguish plan activation,
association, and Unsupported Data Blocks. The trainer implements existing
simulated tracks only. Association must never guess among multiple plans.

## Research

- Supplied `full_manual.pdf`, §5.4.1, pp. 5-66–5-67: identify plan, slew to
  target, activate and associate.
- Supplied `full_manual.pdf`, §5.5.8, pp. 5-120–5-124: active plan creation
  and target squawk fallback.
- R07: `INIT CNTL` tracking feel; current F3 ownership stub remains a
  separately documented trainer delta unless explicitly changed.

## Scope

- Replace mutation-based `correlateFlightPlans()` with plan-state correlation.
- Match only unique discrete assigned squawks for automatic activation.
- Mark zero matches unassociated and multiple matches ambiguous; never guess.
- Add explicit plan identity by ACID, beacon, or FL index plus slew/click.
- Keep plan association separate from controller ownership and aircraft intent.
- Upgrade associated target to FDB and remove the plan from FL/TAB projection.

## Out of scope

- F3 behavior change, remote positions, handoffs, pointouts, or networking.
- Radio squawk changes, pilot execution, or flight-plan route flying.
- Unsupported Data Blocks.

## Acceptance criteria

- [ ] **AC1 —** One matching discrete squawk activates and associates exactly
  one plan.
- [ ] **AC2 —** Zero or multiple matches never associate automatically.
- [ ] **AC3 —** Explicit identity plus target click associates the requested
  plan and reports invalid/ambiguous identity.
- [ ] **AC4 —** Association supplies authoritative ACID/plan fields to the
  track without changing kinematics.
- [ ] **AC5 —** Tests cover `1200`, duplicate codes, stale FL indices, and
  manual association.

## Test plan

- Unit: correlation selector and ambiguity errors.
- Integration: FL → squawk report → FDB association lifecycle.

## Suggested files

- `src/core/flightPlan.ts`
- `src/core/world.ts`
- `src/scope/systemLists.ts`
- `src/scope/ppi.ts`
- `src/scope/previewArea.ts`
- `src/scope/test/flightPlanLifecycle.integration.test.ts`

