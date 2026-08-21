# T01-01 Sim clock and stepWorld

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** M
**Depends on:** T00-03 (folder layout); Phase 0 exit green
**Blocks:** T01-02, T01-03, T01-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The sim has a single `World`, a monotonic `simTimeMs`, and a pure `stepWorld(world, dt)` that advances sim time at a fixed 20 Hz step. Render loops and tests share this function. Wall clock is not sim time.

## Context

`phases/_shared/architecture.md` Runtime: rAF drives **render**; physics is fixed timestep `dt = 1/20 s` via `stepWorld(world, dt)` so Vitest can run without rAF.

`phases/_shared/glossary.md`: time unit is **milliseconds of sim time**. Sim rate `1.0` = real time; Phase 1 must support `1` and `2` (UI wiring is T01-12; fields live here).

This ticket does **not** move aircraft. It owns the clock, pause flag, rate field, accumulator helper, and an empty `stepWorld` body that later tickets extend.

## Scope

- Add `World` with at least: `simTimeMs`, `paused`, `simRate` (`1 | 2`), `aircraft` (empty array type can be `unknown[]` or a stub until T01-02), `selectedAircraftId: string | null`.
- `createWorld(partial?: Partial<World>): World` with defaults: `simTimeMs = 0`, `paused = false`, `simRate = 1`, `aircraft = []`, `selectedAircraftId = null`.
- Export `PHYSICS_HZ = 20` and `SIM_DT_S = 1 / 20`.
- `stepWorld(world: World, dtS: number): World` — add `dtS * 1000` to `simTimeMs`. Mutate in place and return the same object (single World; no Redux). Reject or ignore non-finite `dtS` in tests by not calling it that way; do not throw from the tick in production.
- `createAccumulator()` (or `advanceWorldFromWall(world, wallDtS, acc)`) that:
  - If `paused`, does not call `stepWorld` and does not grow `simTimeMs` (may drop or hold remainder; **hold remainder**, do not discard, so unpause is smooth).
  - Else adds `wallDtS * simRate` to remainder.
  - While remainder ≥ `SIM_DT_S`, call `stepWorld(world, SIM_DT_S)` and subtract `SIM_DT_S`.
  - Cap iterations per call at **8** (document `MAX_PHYSICS_STEPS_PER_FRAME = 8`) to avoid spiral of death if a tab pauses.
- Do not import `requestAnimationFrame` in `src/core`. A later UI ticket uses the accumulator from the shell.

## Out of scope

- Aircraft kinematics, spawn, parser, PPI, pause **keybindings**.
- Variable `dt` from display refresh.
- Wall-clock timestamps on `World` (PTT latency is Phase 3).

## Implementation notes

Suggested shape:

```ts
export const PHYSICS_HZ = 20;
export const SIM_DT_S = 1 / PHYSICS_HZ;
export const MAX_PHYSICS_STEPS_PER_FRAME = 8;

export type SimRate = 1 | 2;

export interface World {
  simTimeMs: number;
  paused: boolean;
  simRate: SimRate;
  aircraft: []; // T01-02 replaces this
  selectedAircraftId: string | null;
}

export function stepWorld(world: World, dtS: number): World {
  world.simTimeMs += dtS * 1000;
  return world;
}
```

Accumulator is DOM-free and testable:

```ts
export interface Accumulator {
  remainderS: number;
}

export function advanceWorld(world: World, wallDtS: number, acc: Accumulator): void {
  if (world.paused) return;
  acc.remainderS += wallDtS * world.simRate;
  let steps = 0;
  while (acc.remainderS >= SIM_DT_S && steps < MAX_PHYSICS_STEPS_PER_FRAME) {
    stepWorld(world, SIM_DT_S);
    acc.remainderS -= SIM_DT_S;
    steps += 1;
  }
}
```

`simTimeMs` may be a float; tests should use `toBeCloseTo` where needed. Prefer keeping it exact by adding `50` ms per 0.05 s step (`0.05 * 1000`).

Export from the `src/core` public barrel Phase 0 defined (`T00-03`).

## Acceptance criteria

- [ ] **AC1 —** `createWorld()` yields `simTimeMs === 0`, `paused === false`, `simRate === 1`.
- [ ] **AC2 —** Twenty calls of `stepWorld(world, SIM_DT_S)` increase `simTimeMs` by `1000` (±0.5 ms).
- [ ] **AC3 —** `advanceWorld` with `paused === true` and `wallDtS = 1` does not change `simTimeMs`.
- [ ] **AC4 —** `advanceWorld` with `simRate === 2` and `wallDtS = 1` (unpaused) advances ~`2000` ms of sim time (40 steps), subject to the 8-step cap **per call** — therefore a single 1 s wall dump must not spiral: either document that callers must feed ~frame-sized `wallDtS`, or loop the helper until wall time is consumed in tests using many 1/60 s slices. **Required:** 60 calls of `advanceWorld(world, 1/60, acc)` at `simRate === 1` yield `simTimeMs` ≈ 1000 ms.
- [ ] **AC5 —** `src/core` tests import `stepWorld` with no `window` / `document` / rAF. Vitest file exists and is in `npm test`.
- [ ] **AC6 —** `stepWorld` is the **only** function that increments `simTimeMs` (grep-able; no `Date.now()` assigned to `simTimeMs`).

## Test plan

- Unit: createWorld defaults; 20 steps → 1 sim second; pause; 1x ≈ real time via 60 × (1/60) s wall; 2x via 60 × (1/60) s wall → ~2 sim seconds.
- Integration: none
- Manual: none

## Suggested files

- `src/core/world.ts`
- `src/core/clock.ts`
- `src/core/world.test.ts`
- `src/core/index.ts` (re-export)
