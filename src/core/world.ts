import type { Aircraft } from "./aircraft";
import {
  caPairKey,
  emptyWorldAlerts,
  evaluateConflictAlert,
  type CaAlert,
  type WorldAlerts,
} from "./alerts/conflictAlert";
import {
  DEFAULT_MSAW_INHIBIT,
  evaluateMsaw,
  msawFloorFt,
  type MvaChart,
  type MsawAlert,
  type MsawInhibitGeom,
} from "./alerts/msaw";
import { MAX_PHYSICS_STEPS_PER_FRAME, SIM_DT_S } from "./clock";
import type { SessionLog } from "./events/session-log";
import { stepAircraft } from "./kinematics";
import type { FixRegistry, FixRegistrySource } from "./nav/fixRegistry";
import { buildFixRegistry } from "./nav/fixRegistry";
import { applyLateralFms } from "./fms/lateral";
import { applyMissedFms } from "./fms/missed";
import { despawnLandedAircraft } from "./fms/landing";
import { applyGlidepathFms, applyVerticalFms, type CatalogStar } from "./fms/vertical";
import { locAxisForApproach } from "./nav/localizer";
import { gsParamsForApproach } from "./nav/glidepath";

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
   * When navaids/fixes include xNm/yNm, `createWorld` builds `fixRegistry`.
   */
  catalog?: {
    airportId: string;
    navaids: ReadonlyArray<{ id: string; xNm?: number; yNm?: number; kind?: string }>;
    fixes: ReadonlyArray<{ id: string; xNm?: number; yNm?: number; kind?: string }>;
    stars: ReadonlyArray<CatalogStar>;
    fieldElevFt?: number;
    approaches: ReadonlyArray<{
      id: string;
      courseDeg?: number;
      lengthNm?: number;
      beamHalfWidthDeg?: number;
      thresholdFixId?: string;
      gsAngleDeg?: number;
      tchFt?: number;
      daFt?: number;
      missed?: { headingDeg: number; climbToFt: number; directFixId?: string };
    }>;
    sids: ReadonlyArray<{ id: string }>;
  };
  /**
   * O(1) DCT / STAR lookup. Built from `catalog` geometry when present.
   * `stepWorld` consumes this — no hard-coded lat/lon in the tick.
   */
  fixRegistry: FixRegistry | null;
  /** Active CA / MSAW sets. Scope reads this; it must not recompute alerts. */
  alerts: WorldAlerts;
  /**
   * Trainer MVA chart. `stepWorld` evaluates MSAW when set; tests may omit it.
   * Scope never reads this.
   */
  mvaChart: MvaChart | null;
  /**
   * Threshold + FAF distance for loc/GS/landing inhibit. When `mvaChart` is
   * set and this is null, KDEM RW27 / 6 NM is used.
   */
  msawInhibit: MsawInhibitGeom | null;
  /**
   * Optional session log for CA/MSAW edge events. The app wires `createApp`'s log.
   * Tests pass one when they assert `alert.ca.*` / `alert.msaw.*`.
   */
  sessionLog: SessionLog | null;
}

function catalogToFixSource(catalog: NonNullable<World["catalog"]>): FixRegistrySource | null {
  const navaids: Array<{ id: string; xNm: number; yNm: number; kind: string }> = [];
  for (const navaid of catalog.navaids) {
    if (typeof navaid.xNm !== "number" || typeof navaid.yNm !== "number") {
      return null;
    }
    navaids.push({
      id: navaid.id,
      xNm: navaid.xNm,
      yNm: navaid.yNm,
      kind: navaid.kind ?? "navaid",
    });
  }
  const fixes: Array<{ id: string; xNm: number; yNm: number; kind: string }> = [];
  for (const fix of catalog.fixes) {
    if (typeof fix.xNm !== "number" || typeof fix.yNm !== "number") {
      return null;
    }
    fixes.push({
      id: fix.id,
      xNm: fix.xNm,
      yNm: fix.yNm,
      kind: fix.kind ?? "fix",
    });
  }
  return { navaids, fixes };
}

function fixRegistryFromPartial(partial?: Partial<World>): FixRegistry | null {
  if (partial?.fixRegistry !== undefined) {
    return partial.fixRegistry;
  }
  if (!partial?.catalog) {
    return null;
  }
  const source = catalogToFixSource(partial.catalog);
  if (source === null) {
    return null;
  }
  return buildFixRegistry(source);
}

export function createWorld(partial?: Partial<World>): World {
  return {
    simTimeMs: partial?.simTimeMs ?? 0,
    paused: partial?.paused ?? false,
    simRate: partial?.simRate ?? 1,
    aircraft: partial?.aircraft ?? [],
    selectedAircraftId: partial?.selectedAircraftId ?? null,
    catalog: partial?.catalog,
    fixRegistry: fixRegistryFromPartial(partial),
    alerts: partial?.alerts ?? emptyWorldAlerts(),
    mvaChart: partial?.mvaChart ?? null,
    msawInhibit: partial?.msawInhibit ?? null,
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

function liveMsawMetrics(
  world: World,
  callsign: string,
  fallback: MsawAlert,
): { altFt: number; floorFt: number } {
  const ac = world.aircraft.find((item) => item.callsign === callsign);
  if (!ac || !world.mvaChart) {
    return { altFt: fallback.altFt, floorFt: fallback.floorFt };
  }
  return { altFt: ac.altitudeFt, floorFt: msawFloorFt(ac.xNm, ac.yNm, world.mvaChart) };
}

/**
 * Replace `world.alerts.msaw` and append `alert.msaw.*` only when a callsign's
 * severity changes (enter / upgrade / downgrade / clear). No per-tick spam.
 */
function syncMsawAlerts(world: World, next: MsawAlert[]): void {
  const prev = world.alerts.msaw;
  const prevMap = new Map<string, MsawAlert>();
  for (const alert of prev) {
    prevMap.set(alert.callsign, alert);
  }
  const nextMap = new Map<string, MsawAlert>();
  for (const alert of next) {
    nextMap.set(alert.callsign, alert);
  }
  const log = world.sessionLog;
  if (log) {
    const atSimMs = world.simTimeMs;
    for (const alert of next) {
      const was = prevMap.get(alert.callsign);
      if (was?.severity === alert.severity) {
        continue;
      }
      log.append({
        type: alert.severity === "alert" ? "alert.msaw.alert" : "alert.msaw.caution",
        atSimMs,
        atWallMs: 0,
        callsign: alert.callsign,
        altFt: alert.altFt,
        floorFt: alert.floorFt,
      });
    }
    for (const was of prev) {
      if (nextMap.has(was.callsign)) {
        continue;
      }
      const live = liveMsawMetrics(world, was.callsign, was);
      log.append({
        type: "alert.msaw.clear",
        atSimMs,
        atWallMs: 0,
        callsign: was.callsign,
        altFt: live.altFt,
        floorFt: live.floorFt,
      });
    }
  }
  world.alerts.msaw = next;
}

/**
 * Advance sim time by `dtS` seconds, then move each aircraft toward intent.
 *
 * Order is frozen: bump `simTimeMs` first, then missed (DA / level-off DIRECT),
 * then lateral FMS (commanded heading), then GS FMS (after loc / LANDING), then
 * kinematics, then threshold despawn (T04-12), then CA, then MSAW (pure
 * functions of the post-kinematics `aircraft[]`). IDENT flash expiry uses the
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
    const locAxisFor = (approachId: string) =>
      locAxisForApproach(approachId, world.catalog, world.fixRegistry);
    applyMissedFms(ac, {
      catalog: world.catalog,
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
    });
    const commandedHeadingDeg = applyLateralFms(ac, dtS, {
      registry: world.fixRegistry,
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
      catalog: world.catalog,
      locAxisFor,
    });
    const gsCommandedFt = applyGlidepathFms(ac, dtS, {
      locAxisFor,
      gsParamsFor: (approachId) => gsParamsForApproach(approachId, world.catalog),
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
    });
    const vertical = applyVerticalFms(ac, world.catalog);
    stepAircraft(
      ac,
      dtS,
      commandedHeadingDeg,
      gsCommandedFt ?? vertical.altitudeFt,
      vertical.speedKt,
    );
    if (ac.identUntilSimMs > 0 && world.simTimeMs >= ac.identUntilSimMs) {
      ac.identUntilSimMs = 0;
    }
  }
  despawnLandedAircraft(world);
  syncConflictAlerts(world, evaluateConflictAlert(world.aircraft));
  if (world.mvaChart) {
    syncMsawAlerts(
      world,
      evaluateMsaw(world.aircraft, world.mvaChart, world.msawInhibit ?? DEFAULT_MSAW_INHIBIT),
    );
  } else {
    syncMsawAlerts(world, []);
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
