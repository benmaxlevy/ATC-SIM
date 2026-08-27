import type { Aircraft } from "./aircraft";
import type { TrackHandoff } from "./handoff";
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
import { handoffFor } from "./handoff";
import { applyLateralFms } from "./fms/lateral";
import { applyMissedFms, isLandingInhibited } from "./fms/missed";
import { despawnLandedAircraft } from "./fms/landing";
import {
  applyGlidepathFms,
  applyVerticalFms,
  type CatalogSid,
  type CatalogStar,
} from "./fms/vertical";
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
    sids: ReadonlyArray<CatalogSid>;
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
  /**
   * Inbound handoff keyed by aircraft id (T04-16). Missing id is `{ kind: "none" }`.
   * Radio rejects while `kind === "inbound"`. Not Command IR; not kinematics.
   */
  handoffs: Map<string, TrackHandoff>;
  /**
   * Scheduled departure traffic (T04-21). Evaluated each stepWorld tick.
   */
  scheduledDepartures?: ScheduledDeparture[];
  /**
   * Optional custom departure spawner hook.
   */
  departureSpawner?: (world: World) => Aircraft[];
  /** Optional deterministic scenario arrival scheduler. */
  arrivalScheduler?: { drain: (world: World) => Aircraft[] };
}

export interface ScheduledDeparture {
  callsign: string;
  runwayId: string;
  sidId: string;
  transitionId?: string;
  assignedAltitudeFt?: number;
  aircraftType?: string;
  scheduledSimMs: number;
  spawned?: boolean;
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
    handoffs: partial?.handoffs ?? new Map(),
    scheduledDepartures: partial?.scheduledDepartures,
    departureSpawner: partial?.departureSpawner,
    arrivalScheduler: partial?.arrivalScheduler,
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

function syncAlertMap<T extends { severity: string }>(
  prev: readonly T[],
  next: readonly T[],
  keyOf: (item: T) => string,
  onActive: (alert: T) => void,
  onClear: (was: T) => void,
): void {
  const prevMap = new Map<string, T>();
  for (const alert of prev) {
    prevMap.set(keyOf(alert), alert);
  }
  const nextMap = new Map<string, T>();
  for (const alert of next) {
    nextMap.set(keyOf(alert), alert);
  }
  for (const alert of next) {
    const was = prevMap.get(keyOf(alert));
    if (was?.severity === alert.severity) {
      continue;
    }
    onActive(alert);
  }
  for (const was of prev) {
    if (nextMap.has(keyOf(was))) {
      continue;
    }
    onClear(was);
  }
}

/**
 * Replace `world.alerts.ca` and append `alert.ca.*` only when a pair's
 * severity changes (enter / upgrade / downgrade / clear). No per-tick spam.
 */
function syncConflictAlerts(world: World, next: CaAlert[]): void {
  const log = world.sessionLog;
  if (log) {
    const atSimMs = world.simTimeMs;
    syncAlertMap(
      world.alerts.ca,
      next,
      (alert) => caPairKey(alert.callsignA, alert.callsignB),
      (alert) => {
        log.append({
          type: alert.severity === "alert" ? "alert.ca.alert" : "alert.ca.caution",
          atSimMs,
          atWallMs: 0,
          callsignA: alert.callsignA,
          callsignB: alert.callsignB,
          distNm: alert.distNm,
          deltaAltFt: alert.deltaAltFt,
        });
      },
      (was) => {
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
      },
    );
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
  const log = world.sessionLog;
  if (log) {
    const atSimMs = world.simTimeMs;
    syncAlertMap(
      world.alerts.msaw,
      next,
      (alert) => alert.callsign,
      (alert) => {
        log.append({
          type: alert.severity === "alert" ? "alert.msaw.alert" : "alert.msaw.caution",
          atSimMs,
          atWallMs: 0,
          callsign: alert.callsign,
          altFt: alert.altFt,
          floorFt: alert.floorFt,
        });
      },
      (was) => {
        const live = liveMsawMetrics(world, was.callsign, was);
        log.append({
          type: "alert.msaw.clear",
          atSimMs,
          atWallMs: 0,
          callsign: was.callsign,
          altFt: live.altFt,
          floorFt: live.floorFt,
        });
      },
    );
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
  world.arrivalScheduler?.drain(world);
  world.departureSpawner?.(world);
  const locAxisFor = (approachId: string) =>
    locAxisForApproach(approachId, world.catalog, world.fixRegistry);
  for (const ac of world.aircraft) {
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
  despawnDepartedAircraft(world);
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

/** Standard TRACON boundary radius in NM for departure exit / despawn. */
export const TRACON_BOUNDARY_RADIUS_NM = 28;

/**
 * After kinematics: despawn outbound / departure aircraft that reached or exceeded
 * the TRACON boundary (>= 28 NM). Logs `handoff.outbound.completed` (if handed off)
 * and `nav.departed`. Mutates `world.aircraft`.
 */
export function despawnDepartedAircraft(world: World): void {
  const gone = new Set<string>();
  const ctx = {
    log: world.sessionLog,
    simTimeMs: world.simTimeMs,
  };
  for (const ac of world.aircraft) {
    if (isLandingInhibited(ac) || ac.intent.lateral?.type === "LANDING") {
      continue;
    }
    const distNm = Math.hypot(ac.xNm, ac.yNm);
    const ho = handoffFor(world, ac.id);
    const isOutboundOrDeparture =
      ho.kind === "outbound" || ho.kind === "departure" || ac.intent.vertical?.type === "VIA_SID";

    if (isOutboundOrDeparture && distNm >= TRACON_BOUNDARY_RADIUS_NM) {
      if (ho.kind === "outbound") {
        ctx.log?.append({
          type: "handoff.outbound.completed",
          atSimMs: ctx.simTimeMs,
          atWallMs: 0,
          callsign: ac.callsign,
          toSectorId: ho.toSectorId,
        });
      }
      ctx.log?.append({
        type: "nav.departed",
        atSimMs: ctx.simTimeMs,
        atWallMs: 0,
        callsign: ac.callsign,
      });
      gone.add(ac.id);
    }
  }
  if (gone.size === 0) {
    return;
  }
  world.aircraft = world.aircraft.filter((ac) => !gone.has(ac.id));
  for (const id of gone) {
    world.handoffs.delete(id);
  }
  if (world.selectedAircraftId && gone.has(world.selectedAircraftId)) {
    world.selectedAircraftId = null;
  }
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
