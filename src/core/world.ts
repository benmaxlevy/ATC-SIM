import type { Aircraft } from "./aircraft";
import type { TrackHandoff } from "./handoff";
import type { RadioRequest } from "./radio/requests";
import {
  atpaPairKey,
  evaluateAtpa,
  resolveAtpaGeometry,
  type AtpaPair,
  type AtpaVolumeParams,
} from "./alerts/atpa";
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
import type { FixRegistry, FixRegistrySource, RegisteredFix } from "./nav/fixRegistry";
import { buildFixRegistry } from "./nav/fixRegistry";
import {
  acceptOutboundHandoff,
  DEFAULT_CENTER_SECTOR_ID,
  DEFAULT_TOWER_SECTOR_ID,
  OUTBOUND_HANDOFF_AUTO_ACCEPT_DELAY_MS,
  handoffFor,
} from "./handoff";
import { applyLateralFms } from "./fms/lateral";
import { applyMissedFms, isLandingInhibited, missedApproachId } from "./fms/missed";
import { despawnLandedAircraft } from "./fms/landing";
import { resolveApproachContext, type ApproachContext } from "./nav/approachContext";
import {
  applyGlidepathFms,
  applyVerticalFms,
  type CatalogSid,
  type CatalogStar,
} from "./fms/vertical";
import {
  locAxisForApproach,
  locDeviation,
  type LocAxis,
  type LocCatalog,
  type LocCatalogApproach,
} from "./nav/localizer";
import { alongTrackNm } from "./nav/geometry";
import { gsParamsForApproach } from "./nav/glidepath";
import { performanceRegistry } from "./performance/registry";
import { resolvePerformanceRegime } from "./performance/regime";
import type { AircraftPerformanceProfile } from "./performance/types";
import {
  routeFixIds,
  isFlightPlanOperational,
  synchronizeFlightPlanRoute,
  updateAircraftSquawk,
  type FlightPlan,
} from "./flightPlan";
import { DEFAULT_BEACON_POOL_CONFIG, type BeaconPoolConfig } from "./beaconPools";
import { aircraftInsideClassB, handleClassBBoundary } from "./vfrClassBClearance";
import type { RegionalFacility } from "../scenario/regional";

/** Generic world navigation context. Variation is never facility-special-cased. */
export interface WorldNavigationContext {
  /** Magnetic degrees east-positive: true = magnetic + magVarDeg. */
  magVarDeg: number;
}

export type SimRate = 1 | 2;

/**
 * Single mutable sim snapshot. `stepWorld` is the only function that increments
 * `simTimeMs`. Tracks are 1:1 with `aircraft` (no sensor error).
 */
export interface World {
  simTimeMs: number;
  paused: boolean;
  simRate: SimRate;
  navigation: WorldNavigationContext;
  aircraft: Aircraft[];
  /** Authoritative local operational records; surveillance stays on Aircraft. */
  flightPlans: FlightPlan[];
  /** Trainer beacon adaptation; empty/default `none` means no automatic code. */
  beaconPools: BeaconPoolConfig;
  selectedAircraftId: string | null;
  /**
   * Facility catalog when the world was spawned from a scenario.
   * Full schema is `@scenario` ProcedureCatalog; core only needs ids here.
   * When navaids/fixes include xNm/yNm, `createWorld` builds `fixRegistry`.
   */
  catalog?: {
    airportId: string;
    name?: string;
    spokenAliases?: readonly string[];
    /** Separate clearance-endpoint geometry; never registered as a tactical fix. */
    airportEndpoint?: { xNm: number; yNm: number };
    magVarDeg?: number;
    navaids: ReadonlyArray<{
      id: string;
      name?: string;
      aliases?: readonly string[];
      xNm?: number;
      yNm?: number;
      kind?: string;
    }>;
    fixes: ReadonlyArray<{
      id: string;
      aliases?: readonly string[];
      xNm?: number;
      yNm?: number;
      kind?: string;
    }>;
    stars: ReadonlyArray<CatalogStar>;
    fieldElevFt?: number;
    approaches: ReadonlyArray<{
      id: string;
      type?: string;
      runway?: string;
      runwayId?: string;
      /** Published inbound course, magnetic. `courseDeg` is loader compatibility only. */
      publishedCourseMagneticDeg?: number;
      courseDeg?: number;
      lengthNm?: number;
      beamHalfWidthDeg?: number;
      thresholdFixId?: string;
      fafFixId?: string;
      fafDistanceNm?: number;
      gsAngleDeg?: number;
      tchFt?: number;
      daFt?: number;
      missed?: { headingDeg: number; climbToFt: number; directFixId?: string };
    }>;
    sids: ReadonlyArray<CatalogSid>;
    atpaVolumes?: ReadonlyArray<AtpaVolumeParams>;
  };
  /** Scenario active runway. Runway-tagged STAR transition amends must match. */
  activeRunwayId?: string;
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
   * Tests pass one when they assert `alert.ca.*` / `alert.msaw.*` / `alert.atpa.*`.
   */
  sessionLog: SessionLog | null;
  /**
   * Inbound handoff keyed by aircraft id (T04-16). Missing id is `{ kind: "none" }`.
   * Radio rejects while `kind === "inbound"`. Not Command IR; not kinematics.
   */
  handoffs: Map<string, TrackHandoff>;
  /** Simulated acceptance deadlines for supported outbound handoffs. */
  outboundHandoffInitiatedAtSimMs: Map<string, number>;
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
  /** Optional generic ambient VFR traffic manager (T04-71). */
  vfrTrafficManager?: { step: (world: World, dtS: number) => void };
  /** Optional regional facility metadata (T04-70). */
  regional?: unknown;
  /** Authoritative radio requests (flight following, IFR pickup) (T04-73). */
  radioRequests?: RadioRequest[];
  /** Optional pilot VFR request and cancellation scheduler (T04-72). */
  vfrRequestQueue?: {
    scheduleIfrCancellationCandidate?: (
      aircraft: Aircraft,
      simTimeMs: number,
      options?: { delayMs?: number; log?: SessionLog },
    ) => unknown;
  };
  /** Optional pilot VFR request configuration (T04-76). */
  vfrRequestConfig?: unknown;
  /** Optional cancellation scheduler hook (T04-74). */
  scheduleIfrCancellationCandidate?: (
    aircraft: Aircraft,
    simTimeMs: number,
    options?: { delayMs?: number; log?: SessionLog },
  ) => unknown;
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
  assignedSquawk?: string;
  squawk?: string;
  index?: number;
}

function catalogToFixSource(catalog: NonNullable<World["catalog"]>): FixRegistrySource | null {
  const airportId = catalog.airportId.trim().toUpperCase();
  const navaids: Array<{ id: string; xNm: number; yNm: number; kind: string }> = [];
  for (const navaid of catalog.navaids) {
    if (navaid.id.trim().toUpperCase() === airportId) continue;
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
    if (fix.id.trim().toUpperCase() === airportId) continue;
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

/**
 * FMS-only navigation view. Airport ARP is executable as a clearance limit,
 * but stays absent from World.fixRegistry so DIRECT/CROSS cannot ground it.
 */
function clearanceRouteRegistry(world: World): FixRegistry | null {
  const base = world.fixRegistry;
  const airportId = world.catalog?.airportId.trim().toUpperCase();
  const activeAirport = world.aircraft.some((aircraft) =>
    aircraft.activeClearance?.route.route.segments.some((segment) =>
      segment.fixIds.some((id) => id.trim().toUpperCase() === airportId),
    ),
  );
  if (!activeAirport || !airportId) return base;
  const endpoint = world.catalog?.airportEndpoint ?? { xNm: 0, yNm: 0 };
  const airport: RegisteredFix = Object.freeze({
    id: airportId,
    xNm: endpoint.xNm,
    yNm: endpoint.yNm,
    kind: "airport-endpoint",
  });
  return {
    get(id: string) {
      const normalized = id.trim().toUpperCase();
      return normalized === airportId ? airport : base?.get(id);
    },
    require(id: string) {
      const found = this.get(id);
      if (!found) throw new Error(`Unknown fix ${id.trim().toUpperCase()}`);
      return found;
    },
    has(id: string) {
      return this.get(id) !== undefined;
    },
    ids() {
      return base?.ids() ?? [];
    },
  };
}

export function createWorld(partial?: Partial<World>): World {
  const magVarDeg = partial?.navigation?.magVarDeg ?? partial?.catalog?.magVarDeg ?? 0;
  const flightPlans =
    partial?.flightPlans?.map((plan) => {
      const synchronized = synchronizeFlightPlanRoute(plan);
      // Preserve the existing mutable-world contract: callers holding a plan
      // reference continue to observe edits made through the world.
      Object.assign(plan, synchronized);
      return plan;
    }) ?? [];
  return {
    simTimeMs: partial?.simTimeMs ?? 0,
    paused: partial?.paused ?? false,
    simRate: partial?.simRate ?? 1,
    navigation: { magVarDeg },
    aircraft: partial?.aircraft ?? [],
    flightPlans,
    beaconPools: partial?.beaconPools ?? DEFAULT_BEACON_POOL_CONFIG,
    selectedAircraftId: partial?.selectedAircraftId ?? null,
    catalog: partial?.catalog,
    activeRunwayId: partial?.activeRunwayId,
    fixRegistry: fixRegistryFromPartial(partial),
    alerts: { ...emptyWorldAlerts(), ...partial?.alerts },
    mvaChart: partial?.mvaChart ?? null,
    msawInhibit: partial?.msawInhibit ?? null,
    sessionLog: partial?.sessionLog ?? null,
    handoffs: partial?.handoffs ?? new Map(),
    outboundHandoffInitiatedAtSimMs: partial?.outboundHandoffInitiatedAtSimMs ?? new Map(),
    scheduledDepartures: partial?.scheduledDepartures,
    departureSpawner: partial?.departureSpawner,
    arrivalScheduler: partial?.arrivalScheduler,
    vfrTrafficManager: partial?.vfrTrafficManager,
    radioRequests: partial?.radioRequests ?? [],
    ...(partial?.regional !== undefined ? { regional: partial.regional } : {}),
    ...(partial?.vfrRequestQueue !== undefined ? { vfrRequestQueue: partial.vfrRequestQueue } : {}),
    ...(partial?.scheduleIfrCancellationCandidate !== undefined
      ? { scheduleIfrCancellationCandidate: partial.scheduleIfrCancellationCandidate }
      : {}),
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

function liveAtpaMetrics(
  world: World,
  trailingCallsign: string,
  leadingCallsign: string,
  fallback: AtpaPair,
): { distanceNm: number } {
  const trailing = world.aircraft.find((ac) => ac.callsign === trailingCallsign);
  const leading = world.aircraft.find((ac) => ac.callsign === leadingCallsign);
  if (!trailing || !leading) {
    return { distanceNm: fallback.distanceNm };
  }
  return { distanceNm: Math.hypot(trailing.xNm - leading.xNm, trailing.yNm - leading.yNm) };
}

function atpaEventType(
  status: AtpaPair["status"],
): "alert.atpa.monitor" | "alert.atpa.warning" | "alert.atpa.alert" {
  if (status === "alert") {
    return "alert.atpa.alert";
  }
  if (status === "warning") {
    return "alert.atpa.warning";
  }
  return "alert.atpa.monitor";
}

/**
 * Replace `world.alerts.atpa` and append `alert.atpa.*` only when a pair's
 * status changes (enter / upgrade / downgrade / clear). No per-tick spam.
 */
function syncAtpaPairs(world: World, next: AtpaPair[]): void {
  const log = world.sessionLog;
  if (log) {
    const atSimMs = world.simTimeMs;
    const prev = world.alerts.atpa ?? [];
    const prevMap = new Map(prev.map((pair) => [atpaPairKey(pair), pair]));
    const nextMap = new Map(next.map((pair) => [atpaPairKey(pair), pair]));
    for (const pair of next) {
      const was = prevMap.get(atpaPairKey(pair));
      if (was?.status === pair.status) {
        continue;
      }
      log.append({
        type: atpaEventType(pair.status),
        atSimMs,
        atWallMs: 0,
        trailingCallsign: pair.trailingCallsign,
        leadingCallsign: pair.leadingCallsign,
        volumeId: pair.volumeId,
        distanceNm: pair.distanceNm,
        requiredNm: pair.requiredNm,
      });
    }
    for (const was of prev) {
      if (nextMap.has(atpaPairKey(was))) {
        continue;
      }
      const live = liveAtpaMetrics(world, was.trailingCallsign, was.leadingCallsign, was);
      log.append({
        type: "alert.atpa.clear",
        atSimMs,
        atWallMs: 0,
        trailingCallsign: was.trailingCallsign,
        leadingCallsign: was.leadingCallsign,
        volumeId: was.volumeId,
        distanceNm: live.distanceNm,
        requiredNm: was.requiredNm,
      });
    }
  }
  world.alerts.atpa = next;
}

function evaluateWorldAtpa(world: World): AtpaPair[] {
  const volumes = world.catalog?.atpaVolumes ?? [];
  if (volumes.length === 0 || world.catalog === undefined) {
    return [];
  }
  return evaluateAtpa(
    world.aircraft,
    volumes,
    resolveAtpaGeometry(world.catalog, volumes, world.navigation.magVarDeg),
    world.navigation.magVarDeg,
  );
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
 * Trainer delta: the single-position world has no receiving controller, so the
 * supported receiving positions accept an initiated outbound handoff after
 * five simulated seconds. This invokes the existing acceptance path once; it
 * is not a network or second-sector model.
 */
function acceptDueOutboundHandoffs(world: World): void {
  for (const [aircraftId, initiatedAtSimMs] of world.outboundHandoffInitiatedAtSimMs) {
    const handoff = handoffFor(world, aircraftId);
    if (
      handoff.kind !== "outbound" ||
      (handoff.toSectorId !== DEFAULT_CENTER_SECTOR_ID &&
        handoff.toSectorId !== DEFAULT_TOWER_SECTOR_ID) ||
      handoff.status === "accepted"
    ) {
      world.outboundHandoffInitiatedAtSimMs.delete(aircraftId);
      continue;
    }
    if (world.simTimeMs - initiatedAtSimMs < OUTBOUND_HANDOFF_AUTO_ACCEPT_DELAY_MS) {
      continue;
    }
    world.outboundHandoffInitiatedAtSimMs.delete(aircraftId);
    acceptOutboundHandoff(world, aircraftId);
  }
}

/** Apply pilot-reported beacon changes only after the simulated response delay. */
function applyDueSquawkReports(world: World): void {
  for (const aircraft of world.aircraft) {
    const pending = aircraft.pendingReportedSquawk;
    if (!pending || world.simTimeMs < pending.dueSimMs) {
      continue;
    }
    updateAircraftSquawk(world, aircraft.id, pending.code);
    aircraft.pendingReportedSquawk = undefined;
  }
}

function sameRoute(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Keep the one route cursor aligned with the lateral FMS walker. */
function synchronizeRouteCursor(
  world: World,
  aircraft: Aircraft,
  previous: Aircraft["intent"]["lateral"],
): void {
  const plan = world.flightPlans.find(
    (item) =>
      isFlightPlanOperational(item) &&
      item.acid.trim().toUpperCase() === aircraft.callsign.trim().toUpperCase() &&
      item.routeRecord?.lifecycle === "active",
  );
  const record = aircraft.activeClearance?.route ?? plan?.routeRecord;
  if (!record) return;
  const ids = routeFixIds(record.route);
  const current = aircraft.intent.lateral;
  if (current?.type === "PROCEDURE" && sameRoute(current.routeFixIds, ids)) {
    record.nextIndex = Math.max(record.nextIndex, current.toFixIndex);
    return;
  }
  if (current?.type !== "HEADING" && current?.type !== "INTERCEPT_LOC") return;
  if (previous?.type === "PROCEDURE" && sameRoute(previous.routeFixIds, ids)) {
    record.nextIndex = ids.length;
  } else if (
    previous?.type === "DIRECT" &&
    previous.continuation?.type === "RESUME_ROUTE" &&
    sameRoute(previous.continuation.routeFixIds, ids)
  ) {
    record.nextIndex = Math.max(record.nextIndex, previous.continuation.index);
  }
}

export function resolveApproachSpeedKt(profile?: AircraftPerformanceProfile | null): number {
  const nominal = (profile?.regimes?.approach as { nominalSpeedKt?: number } | undefined)
    ?.nominalSpeedKt;
  if (nominal !== undefined && Number.isFinite(nominal) && nominal > 0) {
    return nominal;
  }
  const minSpeed = profile?.regimes?.approach?.minSpeedKt;
  if (minSpeed !== undefined && Number.isFinite(minSpeed) && minSpeed >= 120) {
    return minSpeed;
  }
  return 140;
}

function findFixPoint(fixId: string, world: World): { xNm: number; yNm: number } | undefined {
  if (world.fixRegistry?.has(fixId)) {
    return world.fixRegistry.get(fixId);
  }
  const f = world.catalog?.fixes?.find(
    (item) => item.id.trim().toUpperCase() === fixId.trim().toUpperCase(),
  );
  if (typeof f?.xNm === "number" && typeof f?.yNm === "number") {
    return { xNm: f.xNm, yNm: f.yNm };
  }
  return undefined;
}

function computeApproachAlongTrackNm(
  point: { xNm: number; yNm: number },
  approachId: string,
  world: World,
  axis?: LocAxis,
  catalog?: LocCatalog | null,
  fixRegistry?: FixRegistry | null,
): number | undefined {
  if (axis) {
    return locDeviation(point, axis).alongTrackNm;
  }
  const effectiveCatalog = catalog ?? world.catalog;
  const effectiveRegistry = fixRegistry ?? world.fixRegistry;
  const approach = effectiveCatalog?.approaches?.find(
    (a: LocCatalogApproach) => a.id.trim().toUpperCase() === approachId.trim().toUpperCase(),
  );
  if (!approach) return undefined;
  const thresholdPoint =
    approach.thresholdFixId && effectiveRegistry?.has(approach.thresholdFixId)
      ? effectiveRegistry.get(approach.thresholdFixId)!
      : { xNm: 0, yNm: 0 };
  let courseDeg = approach.publishedCourseMagneticDeg ?? approach.courseDeg;
  if (courseDeg === undefined) {
    const match = /(\d{1,2})[LCR]?$/i.exec(approachId);
    courseDeg = match ? Number.parseInt(match[1], 10) * 10 : 270;
  }
  return alongTrackNm(point, thresholdPoint, courseDeg);
}

function updateApproachSpeedAssignments(
  ac: Aircraft,
  world: World,
  locAxisFor: (approachId: string) => LocAxis | undefined,
  profile: AircraftPerformanceProfile,
  approachCtx?: ApproachContext,
): void {
  if (ac.intent.controllerAssignedSpeedKt === undefined && ac.intent.speedUntil === undefined) {
    return;
  }

  const approachId =
    ac.intent.clearedApproachId ??
    (ac.intent.lateral?.type === "LOC" ||
    ac.intent.lateral?.type === "LANDING" ||
    ac.intent.lateral?.type === "INTERCEPT_LOC"
      ? ac.intent.lateral.approachId
      : ac.intent.vertical?.type === "GS"
        ? ac.intent.vertical.approachId
        : undefined);

  if (!approachId) {
    return;
  }

  const ctx = approachCtx ?? resolveApproachContext(ac, world);
  const catalog = ctx.catalog ?? world.catalog;
  const fixRegistry = ctx.fixRegistry ?? world.fixRegistry;

  const approach = catalog?.approaches?.find(
    (a) => a.id.trim().toUpperCase() === approachId.trim().toUpperCase(),
  );

  const axis = locAxisFor(approachId);
  const alongTrackDistance = computeApproachAlongTrackNm(
    ac,
    approachId,
    world,
    axis,
    catalog,
    fixRegistry,
  );
  if (alongTrackDistance === undefined) {
    return;
  }

  const fafDistanceNm = approach?.fafDistanceNm ?? 5;
  const hardBoundaryNm = Math.min(fafDistanceNm, 5);

  let gateReached = false;
  const until = ac.intent.speedUntil;
  if (until) {
    if (until.type === "DME") {
      gateReached = alongTrackDistance <= until.distanceNm;
    } else if (until.type === "FAF") {
      gateReached = alongTrackDistance <= fafDistanceNm;
    } else if (until.type === "FIX") {
      let fixSequenced = false;
      if (ac.intent.lateral?.type === "PROCEDURE") {
        fixSequenced = ac.intent.lateral.routeFixIds
          .slice(0, ac.intent.lateral.toFixIndex)
          .includes(until.fixId);
      }
      const fixPoint = findFixPoint(until.fixId, world);
      const fixDist = fixPoint
        ? computeApproachAlongTrackNm(fixPoint, approachId, world, axis, catalog, fixRegistry)
        : undefined;
      gateReached = fixSequenced || (fixDist !== undefined && alongTrackDistance <= fixDist);
    }
  }

  const boundaryReached = alongTrackDistance <= hardBoundaryNm;

  if (gateReached || boundaryReached) {
    ac.intent.controllerAssignedSpeedKt = undefined;
    ac.intent.speedUntil = undefined;
    ac.intent.assignedSpeedKt = resolveApproachSpeedKt(profile);
  }
}

/**
 * Advance sim time by `dtS` seconds, then move each aircraft toward intent.
 *
 * Order is frozen: bump `simTimeMs` first, then missed (DA / level-off DIRECT),
 * then lateral FMS (commanded heading), then GS FMS (after loc / LANDING), then
 * kinematics, then threshold despawn (T04-12), then CA, then ATPA, then MSAW
 * (pure functions of the post-kinematics `aircraft[]`). IDENT flash expiry uses
 * the post-bump time. Mutates `world` in place and returns it (single World; no
 * Redux). Does not throw on non-finite `dtS`.
 * This is the only function that increments `simTimeMs`.
 */
export function stepWorld(world: World, dtS: number): World {
  if (!Number.isFinite(dtS)) {
    return world;
  }
  world.simTimeMs += dtS * 1000;
  applyDueSquawkReports(world);
  world.arrivalScheduler?.drain(world);
  world.departureSpawner?.(world);
  world.vfrTrafficManager?.step(world, dtS);
  acceptDueOutboundHandoffs(world);
  for (const ac of world.aircraft) {
    const regionalFacility = world.regional as RegionalFacility | undefined;
    const wasInsideClassB = aircraftInsideClassB(ac, regionalFacility);
    const previousLateral = ac.intent.lateral;
    const approachCtx = resolveApproachContext(ac, world);
    const effectiveCatalog = approachCtx.catalog ?? world.catalog;
    const effectiveRegistry = approachCtx.fixRegistry ?? world.fixRegistry;
    const locAxisFor = (approachId: string) =>
      locAxisForApproach(
        approachId,
        effectiveCatalog,
        effectiveRegistry,
        world.navigation.magVarDeg,
      );

    applyMissedFms(ac, {
      catalog: effectiveCatalog,
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
    });
    const profile = performanceRegistry.getProfile(ac.aircraftType);
    const regime = profile.regimes ? resolvePerformanceRegime(ac) : undefined;
    const performance = regime && profile.regimes ? profile.regimes[regime] : undefined;
    updateApproachSpeedAssignments(ac, world, locAxisFor, profile, approachCtx);
    let effectivePerformance = performance;
    if (performance && ac.intent.controllerAssignedSpeedKt !== undefined) {
      effectivePerformance = {
        ...performance,
        maxSpeedKt: Math.max(
          performance.maxSpeedKt,
          profile.limits?.maxControlledSpeedKt ?? ac.intent.controllerAssignedSpeedKt,
        ),
        minSpeedKt: Math.min(
          performance.minSpeedKt,
          profile.limits?.minControlledSpeedKt ?? ac.intent.controllerAssignedSpeedKt,
        ),
      };
    }
    const commandedHeadingDeg = applyLateralFms(ac, dtS, {
      registry: clearanceRouteRegistry(world),
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
      catalog: effectiveCatalog,
      locAxisFor,
      magVarDeg: world.navigation.magVarDeg,
      performance: effectivePerformance,
    });
    const gsCommandedFt = applyGlidepathFms(ac, dtS, {
      locAxisFor,
      gsParamsFor: (approachId) => gsParamsForApproach(approachId, effectiveCatalog),
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
      maxDescentFpm: performance?.nominalDescentFpm,
    });
    const vertical = applyVerticalFms(ac, world.catalog, profile);
    stepAircraft(
      ac,
      dtS,
      commandedHeadingDeg,
      gsCommandedFt ?? vertical.altitudeFt,
      vertical.speedKt,
      world.navigation.magVarDeg,
      effectivePerformance,
      profile.limits,
    );
    synchronizeRouteCursor(world, ac, previousLateral);
    if (ac.classBClearance && ac.intent.lateral?.type === "PROCEDURE") {
      ac.classBClearance.routeIndex = ac.intent.lateral.toFixIndex;
    }
    handleClassBBoundary(world, ac, wasInsideClassB, aircraftInsideClassB(ac, regionalFacility));
    if (ac.identUntilSimMs > 0 && world.simTimeMs >= ac.identUntilSimMs) {
      ac.identUntilSimMs = 0;
    }
  }
  despawnLandedAircraft(world);
  despawnDepartedAircraft(world);
  syncConflictAlerts(
    world,
    evaluateConflictAlert(world.aircraft, undefined, world.navigation.magVarDeg),
  );
  syncAtpaPairs(world, evaluateWorldAtpa(world));
  if (world.mvaChart) {
    syncMsawAlerts(
      world,
      evaluateMsaw(
        world.aircraft,
        world.mvaChart,
        world.msawInhibit ?? DEFAULT_MSAW_INHIBIT,
        (ac) => {
          if (ac.intent.lateral?.type === "VISUAL_FINAL") {
            return {
              xNm: ac.intent.lateral.threshold.xNm,
              yNm: ac.intent.lateral.threshold.yNm,
              fafDistanceNm: 3.0,
            };
          }
          const approachId =
            missedApproachId(ac) ?? ac.intent.clearedApproachId ?? ac.intent.locInterceptApproachId;
          if (!approachId) return undefined;
          const approachCtx = resolveApproachContext(ac, world);
          const effectiveCatalog = approachCtx.catalog ?? world.catalog;
          const effectiveRegistry = approachCtx.fixRegistry ?? world.fixRegistry;
          const axis = locAxisForApproach(
            approachId,
            effectiveCatalog,
            effectiveRegistry,
            world.navigation.magVarDeg,
          );
          if (!axis) return undefined;
          const app = effectiveCatalog?.approaches?.find(
            (a) => a.id.trim().toUpperCase() === approachId.trim().toUpperCase(),
          );
          return {
            xNm: axis.thresholdXNm,
            yNm: axis.thresholdYNm,
            fafDistanceNm: app?.fafDistanceNm,
          };
        },
      ),
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
    world.outboundHandoffInitiatedAtSimMs.delete(id);
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
