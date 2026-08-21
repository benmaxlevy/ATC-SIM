import type { Aircraft } from "./aircraft";
import {
  caPairKey,
  emptyWorldAlerts,
  evaluateConflictAlert,
  type CaAlert,
  type WorldAlerts,
} from "./alerts/conflictAlert";
import { MAX_PHYSICS_STEPS_PER_FRAME, SIM_DT_S } from "./clock";
import type { SessionLog } from "./events/session-log";
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
  /**
   * Facility catalog when the world was spawned from a scenario.
   * Full schema is `@scenario` ProcedureCatalog; core only needs ids here.
   */
  catalog?: {
    airportId: string;
    navaids: ReadonlyArray<{ id: string }>;
    fixes: ReadonlyArray<{ id: string }>;
    stars: ReadonlyArray<{ id: string }>;
    approaches: ReadonlyArray<{ id: string }>;
    sids: ReadonlyArray<{ id: string }>;
  };
  /** Active CA set. Scope reads this; it must not recompute CA. */
  alerts: WorldAlerts;
  /**
   * Optional session log for CA edge events. The app wires `createApp`'s log.
   * Tests pass one when they assert `alert.ca.*`.
   */
  sessionLog: SessionLog | null;
}

export function createWorld(partial?: Partial<World>): World {
  return {
    simTimeMs: partial?.simTimeMs ?? 0,
    paused: partial?.paused ?? false,
    simRate: partial?.simRate ?? 1,
    aircraft: partial?.aircraft ?? [],
    selectedAircraftId: partial?.selectedAircraftId ?? null,
    catalog: partial?.catalog,
    alerts: partial?.alerts ?? emptyWorldAlerts(),
    sessionLog: partial?.sessionLog ?? null,
  };
}

/**
 * Select a living aircraft by `Aircraft.id`. Unknown ids clear selection
 * (set null) so a missing track cannot stay selected.
 * Click hit-testing lives in `@scope` (`pickAircraftAt`).
 */
export function setSelectedAircraft(world: World, id: string | null): void {
  if (id === null) {
    world.selectedAircraftId = null;
    return;
  }
  const found = world.aircraft.some((ac) => ac.id === id);
  world.selectedAircraftId = found ? id : null;
}

function livePairMetrics(
  world: World,
  callsignA: string,
  callsignB: string,
  fallback: CaAlert,
): { distNm: number; deltaAltFt: number } {
  const a = world.aircraft.find((ac) => ac.callsign === callsignA);
  const b = world.aircraft.find((ac) => ac.callsign === callsignB);
  if (!a || !b) {
    return { distNm: fallback.distNm, deltaAltFt: fallback.deltaAltFt };
  }
  return {
    distNm: Math.hypot(a.xNm - b.xNm, a.yNm - b.yNm),
    deltaAltFt: Math.abs(a.altitudeFt - b.altitudeFt),
  };
}

/**
 * Replace `world.alerts.ca` and append `alert.ca.*` only when a pair's
 * severity changes (enter / upgrade / downgrade / clear). No per-tick spam.
 */
function syncConflictAlerts(world: World, next: CaAlert[]): void {
  const prev = world.alerts.ca;
  const prevMap = new Map<string, CaAlert>();
  for (const alert of prev) {
    prevMap.set(caPairKey(alert.callsignA, alert.callsignB), alert);
  }
  const nextMap = new Map<string, CaAlert>();
  for (const alert of next) {
    nextMap.set(caPairKey(alert.callsignA, alert.callsignB), alert);
  }
  const log = world.sessionLog;
  if (log) {
    const atSimMs = world.simTimeMs;
    for (const alert of next) {
      const key = caPairKey(alert.callsignA, alert.callsignB);
      const was = prevMap.get(key);
      if (was?.severity === alert.severity) {
        continue;
      }
      log.append({
        type: alert.severity === "alert" ? "alert.ca.alert" : "alert.ca.caution",
        atSimMs,
        atWallMs: 0,
        callsignA: alert.callsignA,
        callsignB: alert.callsignB,
        distNm: alert.distNm,
        deltaAltFt: alert.deltaAltFt,
      });
    }
    for (const was of prev) {
      const key = caPairKey(was.callsignA, was.callsignB);
      if (nextMap.has(key)) {
        continue;
      }
      const live = livePairMetrics(world, was.callsignA, was.callsignB, was);
      log.append({
        type: "alert.ca.clear",
        atSimMs,
        atWallMs: 0,
        callsignA: was.callsignA,
        callsignB: was.callsignB,
        distNm: live.distNm,
        deltaAltFt: live.deltaAltFt,
      });
    }
  }
  world.alerts.ca = next;
}

/**
 * Advance sim time by `dtS` seconds, then move each aircraft toward intent.
 *
 * Order is frozen: bump `simTimeMs` first, then kinematics, then CA (pure
 * function of the post-kinematics `aircraft[]`). IDENT flash expiry uses the
 * post-bump time. Mutates `world` in place and returns it (single World; no
 * Redux). Does not throw on non-finite `dtS`.
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
  syncConflictAlerts(world, evaluateConflictAlert(world.aircraft));
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
