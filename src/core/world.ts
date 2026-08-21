import type { Aircraft } from "./aircraft";
import { MAX_PHYSICS_STEPS_PER_FRAME, SIM_DT_S } from "./clock";
import { stepAircraft } from "./kinematics";

export type SimRate = 1 | 2;

/**
 * Single mutable sim snapshot. `stepWorld` is the only function that increments
 * `simTimeMs`. Tracks are 1:1 with `aircraft` (no sensor error).
 */
export interface World {
  simTimeMs: number;
  paused: boolean;
  simRate: SimRate;
  aircraft: Aircraft[];
  selectedAircraftId: string | null;
}

export function createWorld(partial?: Partial<World>): World {
  return {
    simTimeMs: partial?.simTimeMs ?? 0,
    paused: partial?.paused ?? false,
    simRate: partial?.simRate ?? 1,
    aircraft: partial?.aircraft ?? [],
    selectedAircraftId: partial?.selectedAircraftId ?? null,
  };
}

/**
 * Advance sim time by `dtS` seconds, then move each aircraft toward intent.
 *
 * Order is frozen: bump `simTimeMs` first, then kinematics. IDENT flash expiry
 * uses the post-bump time. Mutates `world` in place and returns it (single
 * World; no Redux). Does not throw on non-finite `dtS`.
 * This is the only function that increments `simTimeMs`.
 */
export function stepWorld(world: World, dtS: number): World {
  if (!Number.isFinite(dtS)) {
    return world;
  }
  world.simTimeMs += dtS * 1000;
  for (const ac of world.aircraft) {
    stepAircraft(ac, dtS);
    if (ac.identUntilSimMs > 0 && world.simTimeMs >= ac.identUntilSimMs) {
      ac.identUntilSimMs = 0;
    }
  }
  return world;
}

/**
 * Wall-time remainder for the fixed-timestep loop. Held across pause so unpause
 * stays smooth; not discarded when a frame hits the step cap.
 */
export interface Accumulator {
  remainderS: number;
}

export function createAccumulator(): Accumulator {
  return { remainderS: 0 };
}

/** Slack so inexact 1/60 wall frames still consume whole 1/20 sim steps. */
const REMAINDER_EPS_S = 1e-9;

/**
 * Convert wall Δt into zero or more fixed `SIM_DT_S` physics steps.
 *
 * Callers must feed ~frame-sized `wallDtS` (e.g. 1/60 s). A single large dump is
 * capped at `MAX_PHYSICS_STEPS_PER_FRAME` so a backgrounded tab cannot spiral;
 * leftover remainder is held. Pause skips stepping and does not add wall time.
 *
 * `stepWorld` is the only function that increments `simTimeMs`.
 */
export function advanceWorld(world: World, wallDtS: number, acc: Accumulator): void {
  if (world.paused) {
    return;
  }
  if (!Number.isFinite(wallDtS)) {
    return;
  }
  acc.remainderS += wallDtS * world.simRate;
  let steps = 0;
  while (acc.remainderS + REMAINDER_EPS_S >= SIM_DT_S && steps < MAX_PHYSICS_STEPS_PER_FRAME) {
    stepWorld(world, SIM_DT_S);
    acc.remainderS -= SIM_DT_S;
    steps += 1;
  }
}
