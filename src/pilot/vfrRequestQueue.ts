/**
 * Seeded unsolicited airborne VFR pilot request and cancellation scheduler (T04-72).
 *
 * Implements:
 * - Mutually exclusive seeded draws for flight following, IFR pickup, or silent ambient VFR
 * - Simulated-time paced admission: (3_600_000 / cap) ms spacing, bounded first slot offset,
 *   FIFO candidate queue, and hard rolling-hour cap enforcement
 * - Radio-busy gating with idle gap after previous transmission
 * - Transmit-time snapshot with structured session log event (vfr.request.transmitted)
 * - Clean withdrawal when aircraft exits or becomes ineligible before due time
 * - Independent IFR cancellation candidate scheduling for accepted pickups
 * - Airspace/Class B validation and withdrawal reporting (pilot.cancel_ifr.withdrawn)
 *
 * State boundary: request records only. No mutation of aircraft operational state,
 * radio contact, radar identification, service, or flight rules.
 */

import {
  courseDeg,
  distanceNm,
  findOpenRadioRequest,
  mulberry32,
  isPointInsideAvoidanceVolumes,
  isSegmentUnsafeFromAvoidance,
  type ClassBRequestIntent,
  type ClassBRequestOperation,
  type ClassBRequestRouteLeg,
  type Aircraft,
  type IfrCancellationCandidate,
  type IfrCancellationState,
  type SessionLog,
  type VfrPilotRequest,
  type VfrPilotRequestKind,
  type VfrPilotRequestState,
  type World,
} from "@core";
import type { AmbientVfrWaypoint } from "../core/aircraft";
import {
  extractVolumePolygonNm,
  planSafeVfrContinuation,
  isVfrAvoidanceVolume,
  pointInPolygon2D,
} from "../core/vfrNavigation";
import {
  DEFAULT_VFR_REQUEST_CONFIG,
  getRegionalAirportEligibility,
  getEligibleVfrDestinations,
  validateVfrRequestConfig,
  VFR_PILOT_REQUEST_XOR,
  type RegionalFacility,
  type VfrRequestConfig,
} from "@scenario";

export type {
  IfrCancellationCandidate,
  IfrCancellationState,
  VfrPilotRequest,
  VfrPilotRequestKind,
  VfrPilotRequestState,
};

export { DEFAULT_VFR_REQUEST_CONFIG, validateVfrRequestConfig };

export const VFR_REQUEST_DEFAULT_SEED = 1;
export const VFR_REQUEST_IDLE_GAP_MS = 500;
export const VFR_CANCEL_DELAY_MIN_MS = 30_000;
export const VFR_CANCEL_DELAY_MAX_MS = 120_000;
const CLASS_B_ROUTE_FIX_TOLERANCE_NM = 0.05;

import { formatCallsignDisplay } from "./telephony";

/** Ordered 8-point cardinal bearings for relative position reports. */
export const VFR_POSITION_CARDINALS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
] as const;

/** Map a true bearing (deg, clockwise from north) to an 8-point cardinal. */
export function bearingToCardinalDirection(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return VFR_POSITION_CARDINALS[index]!;
}

/**
 * VFR callups keep the existing canonical fallback text for TTS identifier
 * expansion, while authored aliases use the shared pilot callsign formatter.
 */
function formatRequestCallsign(callsign: string, spokenAliases?: readonly string[]): string {
  return spokenAliases?.some((alias) => alias.trim().length > 0)
    ? formatCallsignDisplay(callsign, { spokenAliases })
    : callsign;
}

/**
 * Format a VFR flight-following callup with aircraft type, destination, and
 * altitude, e.g. "N123, 15 miles north of KPDK, C172, request flight
 * following to KFTY at 4500".
 *
 * Generic: destination/altitude segments are omitted only when unknown so
 * callers with sparse data still produce a valid fallback call.
 */
export function formatVfrFlightFollowingRequest(args: {
  callsign: string;
  spokenAliases?: readonly string[];
  positionPhrase?: string;
  aircraftType?: string;
  destinationAirportId?: string;
  altitudeFt?: number;
}): string {
  const typeText = args.aircraftType ?? "type unknown";
  const segments = [formatRequestCallsign(args.callsign, args.spokenAliases)];
  if (args.positionPhrase) {
    segments.push(args.positionPhrase);
  }
  segments.push(typeText);
  let suffix = "request flight following";
  if (args.destinationAirportId) {
    suffix += ` to ${args.destinationAirportId}`;
  }
  if (args.altitudeFt !== undefined && Number.isFinite(args.altitudeFt)) {
    suffix += ` at ${Math.round(args.altitudeFt)}`;
  }
  segments.push(suffix);
  return segments.join(", ");
}

/**
 * Format an airborne IFR pickup callup with aircraft identification, position,
 * aircraft type, destination, and requested altitude (FAA AIM §5-1-14).
 *
 * Format: "${callsign}, ${positionPhrase}, ${aircraftType}, request IFR to ${destinationAirportId}, requested altitude ${requestedAltitudeFt}"
 *
 * Degrades gracefully: segments whose properties are undefined or empty are omitted
 * without trailing or duplicate commas.
 */
export function formatIfrPickupRequest(args: {
  callsign: string;
  spokenAliases?: readonly string[];
  positionPhrase?: string;
  aircraftType?: string;
  destinationAirportId?: string;
  requestedAltitudeFt?: number;
}): string {
  const segments: string[] = [formatRequestCallsign(args.callsign, args.spokenAliases)];
  if (args.positionPhrase && args.positionPhrase.trim().length > 0) {
    segments.push(args.positionPhrase.trim());
  }
  if (args.aircraftType && args.aircraftType.trim().length > 0) {
    segments.push(args.aircraftType.trim());
  }
  const dest = args.destinationAirportId?.trim();
  const requestSegment = dest ? `request IFR to ${dest}` : "request IFR";
  segments.push(requestSegment);
  if (args.requestedAltitudeFt !== undefined && Number.isFinite(args.requestedAltitudeFt)) {
    segments.push(`requested altitude ${Math.round(args.requestedAltitudeFt)}`);
  }
  return segments.join(", ");
}

/** Format the deterministic pilot transmission for a pending Class B request. */
export function formatVfrClassBRequest(args: {
  callsign: string;
  spokenAliases?: readonly string[];
  positionPhrase?: string;
  aircraftType?: string;
  altitudeFt?: number;
  headingDeg?: number;
  classBIntent: ClassBRequestIntent;
  classBOperation: ClassBRequestOperation;
  originAirportId?: string;
  destinationAirportId?: string;
  route?: readonly ClassBRequestRouteLeg[];
}): string {
  const segments = [formatRequestCallsign(args.callsign, args.spokenAliases)];
  if (args.positionPhrase) segments.push(args.positionPhrase);
  segments.push(args.aircraftType ?? "type unknown");
  if (args.altitudeFt !== undefined && Number.isFinite(args.altitudeFt)) {
    segments.push(String(Math.round(args.altitudeFt)));
  }
  if (args.headingDeg !== undefined && Number.isFinite(args.headingDeg)) {
    segments.push(`${bearingToCardinalDirection(args.headingDeg)}bound`);
  }
  const phrase =
    args.classBOperation === "THROUGH"
      ? "request transition through Bravo"
      : args.classBIntent === "DEPARTURE"
        ? "request VFR departure into Bravo"
        : "request VFR arrival into Bravo";
  let request = phrase;
  if (args.originAirportId && args.classBIntent === "DEPARTURE") {
    request += ` from ${args.originAirportId}`;
  }
  if (args.destinationAirportId) request += ` to ${args.destinationAirportId}`;
  const route = args.route?.map((leg) => leg.fixId).filter(Boolean);
  if (route && route.length > 0) request += ` via ${route.join(" then ")}`;
  segments.push(request);
  return segments.join(", ");
}

/**
 * Format a VFR position report relative to the nearest regional airport,
 * e.g. "15 miles north of KAHN".
 *
 * Generic: walks the supplied regional airport inventory without any
 * facility-specific branch. Returns undefined when no airport inventory
 * is available so callers can fall back to a position-less call.
 */
export function formatVfrPositionReport(
  positionNm: { xNm: number; yNm: number },
  regional?: RegionalFacility | null,
): string | undefined {
  const airports = regional?.airports;
  if (!airports || airports.length === 0) {
    return undefined;
  }
  let nearest: { icao: string; arpNm: { xNm: number; yNm: number } } | undefined;
  let nearestDistNm = Number.POSITIVE_INFINITY;
  for (const apt of airports) {
    if (!apt?.arpNm || typeof apt.icao !== "string") {
      continue;
    }
    const dist = distanceNm(apt.arpNm, positionNm);
    if (dist < nearestDistNm) {
      nearestDistNm = dist;
      nearest = apt;
    }
  }
  if (!nearest) {
    return undefined;
  }
  const miles = Math.max(1, Math.round(nearestDistNm));
  const bearing = courseDeg(nearest.arpNm, positionNm);
  const cardinal = bearingToCardinalDirection(bearing);
  return `${miles} mile${miles === 1 ? "" : "s"} ${cardinal} of ${nearest.icao}`;
}

export interface VfrRequestRadio {
  isBusy(): boolean;
  play?(text: string, callsign: string): void | Promise<void>;
}

export type IfrCancellationValidator = (
  aircraft: Aircraft,
  world: World,
) => { ok: true } | { ok: false; reason: string };

export interface VfrRequestQueueOptions {
  config?: VfrRequestConfig;
  seed?: number;
  regional?: RegionalFacility;
  cancellationValidator?: IfrCancellationValidator;
  /** Custom delay range or fixed delay for cancellation candidate in tests. */
  cancellationDelayMs?: number | ((rng: () => number) => number);
  /** Custom first slot offset in ms (for testing). */
  initialSlotOffsetMs?: number;
}

export interface DrainVfrRequestsArgs {
  world: World;
  log: SessionLog;
  radio?: VfrRequestRadio;
  setStatus?: (text: string) => void;
  nowWallMs?: () => number;
}

/** Check if an aircraft is eligible for ambient VFR service call scheduling. */
export function isAirborneVfrEligible(aircraft: Aircraft): boolean {
  if (aircraft.flightRules !== "VFR") {
    return false;
  }
  if (aircraft.airborne === false) {
    return false;
  }
  if (aircraft.activeClearance) {
    return false;
  }
  if (aircraft.classBClearance?.active) {
    return false;
  }
  if (!aircraft.ambientVfr) {
    return false;
  }
  if (
    aircraft.ambientVfr.phase === "EXITING" ||
    aircraft.ambientVfr.phase === "HANDOFF_COMPLETED"
  ) {
    return false;
  }
  if (aircraft.altitudeFt <= 0) {
    return false;
  }
  return true;
}

export interface ClassBAccessRequestPlan {
  operation: ClassBRequestOperation;
  intent: ClassBRequestIntent;
  destinationAirportId?: string;
  originAirportId?: string;
  requestedAltitudeFt: number;
  route?: ClassBRequestRouteLeg[];
}

type ClassBAccessAssessment = { plan: ClassBAccessRequestPlan } | { blocked: true } | null;

function sameClassBRoute(
  left: readonly ClassBRequestRouteLeg[] | undefined,
  right: readonly ClassBRequestRouteLeg[] | undefined,
): boolean {
  const leftRoute = left ?? [];
  const rightRoute = right ?? [];
  return (
    leftRoute.length === rightRoute.length &&
    leftRoute.every(
      (leg, index) =>
        leg.type === rightRoute[index]?.type && leg.fixId === rightRoute[index]?.fixId,
    )
  );
}

function classBRequestMatchesPlan(
  request: VfrPilotRequest,
  plan: ClassBAccessRequestPlan,
): boolean {
  return (
    request.classBOperation === plan.operation &&
    request.classBIntent === plan.intent &&
    request.originAirportId === plan.originAirportId &&
    request.destinationAirportId === plan.destinationAirportId &&
    request.requestedAltitudeFt === plan.requestedAltitudeFt &&
    sameClassBRoute(request.route, plan.route)
  );
}

function sameNmPoint(
  left: { xNm: number; yNm: number },
  right: { xNm: number; yNm: number },
): boolean {
  return Math.hypot(left.xNm - right.xNm, left.yNm - right.yNm) <= CLASS_B_ROUTE_FIX_TOLERANCE_NM;
}

/**
 * Ground ambient-VFR waypoints to the current catalog. Airport ARPs and
 * visual-only points are deliberately not route fixes.
 */
function groundClassBRoute(
  world: World,
  waypoints: readonly AmbientVfrWaypoint[],
): ClassBRequestRouteLeg[] | undefined {
  if (!world.fixRegistry || !waypoints || waypoints.length === 0) {
    return undefined;
  }

  const registered = world.fixRegistry
    .ids()
    .map((id) => world.fixRegistry!.get(id))
    .filter((fix): fix is NonNullable<typeof fix> => fix !== undefined);
  const used = new Set<string>();
  const route: ClassBRequestRouteLeg[] = [];

  for (const waypoint of waypoints) {
    if (waypoint.fixId) {
      const fix = world.fixRegistry.get(waypoint.fixId);
      if (!fix || used.has(fix.id) || !sameNmPoint(fix, waypoint)) {
        return undefined;
      }
      used.add(fix.id);
      route.push({ type: "DIRECT", fixId: fix.id });
      continue;
    }

    const matches = registered.filter((fix) => sameNmPoint(fix, waypoint));
    if (matches.length !== 1 || used.has(matches[0]!.id)) {
      return undefined;
    }
    used.add(matches[0]!.id);
    route.push({ type: "DIRECT", fixId: matches[0]!.id });
  }

  return route;
}

function projectedClassBRoute(
  aircraft: Aircraft,
  regional: RegionalFacility,
): Array<{
  xNm: number;
  yNm: number;
  altitudeFt: number;
}> {
  const vfr = aircraft.ambientVfr;
  const waypoints = vfr?.waypoints ?? [];
  const points = [
    { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt },
    ...waypoints.slice(vfr?.waypointIndex ?? 0).map((waypoint) => ({
      xNm: waypoint.xNm,
      yNm: waypoint.yNm,
      altitudeFt: waypoint.altitudeFt ?? aircraft.altitudeFt,
    })),
  ];

  // Synthetic and sparse traffic fixtures may carry only a destination. Add
  // its generic ARP endpoint so the same 3-D test handles those records.
  if (vfr?.mission === "AIRPORT_BOUND" && vfr.destinationAirportId) {
    const destination = regional.airports.find(
      (airport) => airport.icao.toUpperCase() === vfr.destinationAirportId!.toUpperCase(),
    );
    const last = points[points.length - 1]!;
    if (destination && !sameNmPoint(last, destination.arpNm)) {
      points.push({
        xNm: destination.arpNm.xNm,
        yNm: destination.arpNm.yNm,
        altitudeFt: Math.max(destination.fieldElevFt + 1000, 1500),
      });
    }
  }
  return points;
}

/**
 * Determine whether the current projected ambient route needs a pilot Class B
 * request. This is pure geometry/data classification: it never authorizes the
 * aircraft or mutates any world state.
 */
export function assessClassBAccessRequest(
  aircraft: Aircraft,
  world: World,
  regionalOverride?: RegionalFacility,
): ClassBAccessAssessment {
  if (!isAirborneVfrEligible(aircraft)) {
    return null;
  }
  const regional = regionalOverride ?? (world.regional as RegionalFacility | undefined);
  if (!regional) {
    return null;
  }
  const classBVolumes = regional.airspaces.filter(isVfrAvoidanceVolume);
  if (classBVolumes.length === 0) {
    return null;
  }

  const current = { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt };
  if (isPointInsideAvoidanceVolumes(current, classBVolumes)) {
    return null;
  }
  const projected = projectedClassBRoute(aircraft, regional);
  if (
    projected.length < 2 ||
    !projected
      .slice(1)
      .some((point, index) => isSegmentUnsafeFromAvoidance(projected[index]!, point, classBVolumes))
  ) {
    return null;
  }

  const mission = aircraft.ambientVfr?.mission;
  const originAirportId = aircraft.ambientVfr?.originAirportId;
  if (
    mission === "SATELLITE_DEPARTURE" &&
    originAirportId?.toUpperCase() === regional.centerAirportId.toUpperCase()
  ) {
    // Primary-airport departures use their departure clearance; never create
    // a separate pilot OUT_OF request.
    return null;
  }

  const endpoint = projected[projected.length - 1]!;
  const endpointInside = isPointInsideAvoidanceVolumes(endpoint, classBVolumes);
  let intent: ClassBRequestIntent;
  let operation: ClassBRequestOperation;
  switch (mission) {
    case "AIRPORT_BOUND":
      intent = "ARRIVAL";
      operation = endpointInside ? "TO_ENTER" : "THROUGH";
      break;
    case "SATELLITE_DEPARTURE":
      intent = "DEPARTURE";
      operation = endpointInside ? "TO_ENTER" : "THROUGH";
      break;
    case "TRANSIT":
      intent = "TRANSITION";
      operation = "THROUGH";
      break;
    case "LOCAL":
      intent = "TRANSITION";
      operation = endpointInside ? "TO_ENTER" : "THROUGH";
      break;
    default:
      return null;
  }

  const waypoints = (aircraft.ambientVfr?.waypoints ?? []).slice(
    aircraft.ambientVfr?.waypointIndex ?? 0,
  );
  const route = groundClassBRoute(world, waypoints);
  if (operation === "THROUGH" && !route?.length) {
    return { blocked: true };
  }

  const destinationAirportId =
    aircraft.ambientVfr?.destinationAirportId ??
    aircraft.destinationAirport ??
    aircraft.destination;
  const finalWaypointAltitude = waypoints[waypoints.length - 1]?.altitudeFt;
  return {
    plan: {
      operation,
      intent,
      ...(destinationAirportId ? { destinationAirportId } : {}),
      ...(originAirportId ? { originAirportId } : {}),
      requestedAltitudeFt: Math.round(
        aircraft.requestedAltitudeFt ?? finalWaypointAltitude ?? aircraft.altitudeFt,
      ),
      ...(route ? { route } : {}),
    },
  };
}

/** Default validator for pilot IFR cancellation candidates outside Class B. */
export function defaultIfrCancellationValidator(
  aircraft: Aircraft,
  world: World,
): { ok: true } | { ok: false; reason: string } {
  if (aircraft.flightRules !== "IFR") {
    return { ok: false, reason: "ALREADY_VFR" };
  }
  if (!aircraft.activeClearance) {
    return { ok: false, reason: "NO_ACTIVE_IFR" };
  }
  if (aircraft.altitudeFt <= 0) {
    return { ok: false, reason: "ON_GROUND" };
  }
  if (
    aircraft.intent.lateral?.type === "LOC" ||
    aircraft.intent.lateral?.type === "LANDING" ||
    aircraft.intent.vertical?.type === "GS"
  ) {
    return { ok: false, reason: "ON_APPROACH_FINAL" };
  }
  // Airspace check: aircraft must be outside all Class B avoidance volumes
  // (including grouped fallback for fragmented shelf data).
  const regional = world.regional as RegionalFacility | undefined;
  if (regional) {
    const classBVolumes = regional.airspaces.filter(isVfrAvoidanceVolume);
    if (
      isPointInsideAvoidanceVolumes(
        { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt },
        classBVolumes,
      )
    ) {
      return { ok: false, reason: "INSIDE_CLASS_B" };
    }
    const surfaceVolumes = classBVolumes.filter((v) => v.lowerLimitFt <= 0);
    for (const volume of surfaceVolumes) {
      const poly = extractVolumePolygonNm(volume);
      if (pointInPolygon2D({ xNm: aircraft.xNm, yNm: aircraft.yNm }, poly)) {
        return { ok: false, reason: "INSIDE_SURFACE_BRAVO" };
      }
    }
    if (!planSafeVfrContinuation(aircraft, regional)) {
      return { ok: false, reason: "NO_SAFE_CONTINUATION" };
    }
  }
  return { ok: true };
}

export class VfrRequestQueue {
  private rng: () => number;
  private seed: number;
  private flightFollowingPercent: number;
  private ifrPickupPercent: number;
  private requestCapPerHour: number;
  private ifrCancellationPercent: number;
  private regional?: RegionalFacility;
  private readonly cancellationValidator?: IfrCancellationValidator;
  private readonly cancellationDelayOption?: number | ((rng: () => number) => number);
  private readonly initialSlotOffsetMs?: number;

  private requests: VfrPilotRequest[] = [];
  private cancellationCandidates: IfrCancellationCandidate[] = [];
  private readonly evaluatedAircraftIds = new Set<string>();
  private admittedTimesSimMs: number[] = [];
  private nextSlotSimMs: number | null = null;
  private requestCounter = 0;
  private cancellationCounter = 0;
  private playInFlight = false;
  private lastUtteranceEndSimMs: number | null = null;
  private worldRef: World | null = null;

  constructor(options?: VfrRequestQueueOptions) {
    const validated = options?.config ? validateVfrRequestConfig(options.config) : undefined;
    this.seed = options?.seed ?? VFR_REQUEST_DEFAULT_SEED;
    this.rng = mulberry32((this.seed >>> 0) ^ VFR_PILOT_REQUEST_XOR);

    this.flightFollowingPercent = validated?.flightFollowingPercent ?? 0;
    this.ifrPickupPercent = validated?.ifrPickupPercent ?? 0;
    this.requestCapPerHour = validated?.requestCapPerHour ?? 0;
    this.ifrCancellationPercent = validated?.ifrCancellationPercent ?? 0;

    this.regional = options?.regional;
    this.cancellationValidator = options?.cancellationValidator;
    this.cancellationDelayOption = options?.cancellationDelayMs;
    this.initialSlotOffsetMs = options?.initialSlotOffsetMs;
  }

  public getRequests(): readonly VfrPilotRequest[] {
    return this.requests.slice();
  }

  public getCancellationCandidates(): readonly IfrCancellationCandidate[] {
    return this.cancellationCandidates.slice();
  }

  public reset(options?: {
    config?: VfrRequestConfig;
    seed?: number;
    regional?: RegionalFacility;
  }): void {
    if (options?.seed !== undefined) {
      this.seed = options.seed;
    }
    this.rng = mulberry32((this.seed >>> 0) ^ VFR_PILOT_REQUEST_XOR);
    if (options && "config" in options) {
      const validated = options.config ? validateVfrRequestConfig(options.config) : undefined;
      this.flightFollowingPercent = validated?.flightFollowingPercent ?? 0;
      this.ifrPickupPercent = validated?.ifrPickupPercent ?? 0;
      this.requestCapPerHour = validated?.requestCapPerHour ?? 0;
      this.ifrCancellationPercent = validated?.ifrCancellationPercent ?? 0;
    }
    if (options && "regional" in options) {
      this.regional = options.regional;
    }
    this.requests = [];
    this.cancellationCandidates = [];
    this.evaluatedAircraftIds.clear();
    this.admittedTimesSimMs = [];
    this.nextSlotSimMs = null;
    this.requestCounter = 0;
    this.cancellationCounter = 0;
    this.playInFlight = false;
    this.lastUtteranceEndSimMs = null;
    this.worldRef = null;
  }

  /** Release a reserved admission slot when a request withdraws before transmit. */
  private releaseAdmission(request: VfrPilotRequest): void {
    const slotIndex = this.admittedTimesSimMs.indexOf(request.dueAtSimMs);
    if (slotIndex < 0) {
      return;
    }
    this.admittedTimesSimMs.splice(slotIndex, 1);
    const spacingMs = this.requestCapPerHour > 0 ? 3_600_000 / this.requestCapPerHour : 0;
    if (this.admittedTimesSimMs.length === 0) {
      this.nextSlotSimMs = null;
    } else if (this.nextSlotSimMs === request.dueAtSimMs + spacingMs) {
      this.nextSlotSimMs = this.admittedTimesSimMs.at(-1)! + spacingMs;
    }
  }

  /**
   * Schedule requests from all eligible aircraft in the world.
   */
  public scheduleFromWorld(world: World, simTimeMs: number = world.simTimeMs): void {
    for (const aircraft of world.aircraft) {
      this.evaluateAircraft(aircraft, world, simTimeMs);
    }
  }

  /**
   * Evaluate a single aircraft for VFR request scheduling.
   * Draw outcome once; if FF/IFR, admit via sim-time pacing.
   */
  public evaluateAircraft(aircraft: Aircraft, world: World, simTimeMs: number): void {
    if (this.evaluatedAircraftIds.has(aircraft.id)) {
      return;
    }
    if (!isAirborneVfrEligible(aircraft)) {
      return;
    }

    const classBAssessment = assessClassBAccessRequest(aircraft, world, this.regional);
    this.evaluatedAircraftIds.add(aircraft.id);

    if (classBAssessment && "blocked" in classBAssessment) {
      // A route that would require a Class B clearance but cannot be grounded
      // must not silently become an unrelated request.
      return;
    }

    let kind: VfrPilotRequestKind | null = null;
    if (classBAssessment && "plan" in classBAssessment) {
      const existingClassB =
        findOpenRadioRequest(world.radioRequests, aircraft.id, "CLASS_B_ACCESS") ??
        this.requests.find(
          (request) =>
            request.aircraftId === aircraft.id &&
            request.kind === "CLASS_B_ACCESS" &&
            request.state !== "WITHDRAWN",
        );
      if (existingClassB) {
        return;
      }
      kind = "CLASS_B_ACCESS";
    } else {
      const roll = this.rng() * 100;
      if (roll < this.flightFollowingPercent) {
        kind = "FLIGHT_FOLLOWING";
      } else if (roll < this.flightFollowingPercent + this.ifrPickupPercent) {
        kind = "IFR_PICKUP";
      }
    }

    if (!kind) {
      // Silent remainder: intentionally silent ambient traffic.
      return;
    }

    // Cap 0 disables new requests immediately.
    if (this.requestCapPerHour <= 0) {
      const request: VfrPilotRequest = {
        id: `vfr-req-${++this.requestCounter}`,
        aircraftId: aircraft.id,
        callsign: aircraft.callsign,
        kind,
        createdAtSimMs: simTimeMs,
        dueAtSimMs: simTimeMs,
        state: "WITHDRAWN",
        withdrawnReason: "CAP_ZERO",
        positionNm: { xNm: aircraft.xNm, yNm: aircraft.yNm },
        altitudeFt: aircraft.altitudeFt,
        headingDeg: aircraft.headingDeg,
        aircraftType: aircraft.aircraftType,
      };
      this.requests.push(request);
      return;
    }

    // Determine destination, Class B intent, and requested altitude.
    let destinationAirportId: string | undefined;
    let requestedAltitudeFt: number | undefined;
    let classBOperation: ClassBRequestOperation | undefined;
    let classBIntent: ClassBRequestIntent | undefined;
    let originAirportId: string | undefined;
    let route: ClassBRequestRouteLeg[] | undefined;

    if (kind === "CLASS_B_ACCESS") {
      const plan =
        classBAssessment && "plan" in classBAssessment ? classBAssessment.plan : undefined;
      if (!plan) {
        return;
      }
      classBOperation = plan.operation;
      classBIntent = plan.intent;
      destinationAirportId = plan.destinationAirportId;
      originAirportId = plan.originAirportId;
      requestedAltitudeFt = plan.requestedAltitudeFt;
      route = plan.route;
    } else if (kind === "IFR_PICKUP") {
      const regionalFacility = (world.regional as RegionalFacility | undefined) ?? this.regional;
      const eligibleDestinations = getEligibleVfrDestinations(regionalFacility);
      if (eligibleDestinations.length === 0) {
        // Missing imported eligible destination withdraws with NO_DESTINATION per contract table
        const request: VfrPilotRequest = {
          id: `vfr-req-${++this.requestCounter}`,
          aircraftId: aircraft.id,
          callsign: aircraft.callsign,
          kind,
          createdAtSimMs: simTimeMs,
          dueAtSimMs: simTimeMs,
          state: "WITHDRAWN",
          withdrawnReason: "NO_DESTINATION",
          positionNm: { xNm: aircraft.xNm, yNm: aircraft.yNm },
          altitudeFt: aircraft.altitudeFt,
          headingDeg: aircraft.headingDeg,
          aircraftType: aircraft.aircraftType,
        };
        this.requests.push(request);
        return;
      }
      const destIndex = Math.floor(this.rng() * eligibleDestinations.length);
      destinationAirportId = eligibleDestinations[destIndex].icao;

      // Seeded altitude in the existing clearance altitude domain (e.g. 3000-8000 ft)
      const altitudeChoices = [3000, 4000, 5000, 6000, 7000, 8000];
      requestedAltitudeFt = altitudeChoices[Math.floor(this.rng() * altitudeChoices.length)];
    } else {
      // Flight following: intended destination when known from ambient mission,
      // otherwise a seeded eligible regional destination so the pilot can state
      // type, destination, and altitude on callup. When no controlled eligible
      // destination exists (VFR advisories may target any airport), fall back
      // to the nearest regional airport without consuming the seeded stream.
      // Missing inventory leaves the destination undefined and the phrase
      // falls back gracefully.
      destinationAirportId = aircraft.ambientVfr?.destinationAirportId;
      if (!destinationAirportId) {
        const regionalFacility = (world.regional as RegionalFacility | undefined) ?? this.regional;
        const eligibleDestinations = getEligibleVfrDestinations(regionalFacility);
        if (eligibleDestinations.length > 0) {
          const destIndex = Math.floor(this.rng() * eligibleDestinations.length);
          destinationAirportId = eligibleDestinations[destIndex].icao;
        } else {
          const airports = regionalFacility?.airports;
          if (airports && airports.length > 0) {
            let nearestIcao: string | undefined;
            let nearestDist = Number.POSITIVE_INFINITY;
            for (const apt of airports) {
              if (
                typeof apt?.icao !== "string" ||
                !apt?.arpNm ||
                !getRegionalAirportEligibility(apt).eligible
              ) {
                continue;
              }
              const dist = distanceNm(apt.arpNm, { xNm: aircraft.xNm, yNm: aircraft.yNm });
              if (dist < nearestDist) {
                nearestDist = dist;
                nearestIcao = apt.icao;
              }
            }
            destinationAirportId = nearestIcao;
          }
        }
      }
      // Requested cruise for VFR advisories is the current Mode C altitude.
      requestedAltitudeFt = Math.round(aircraft.altitudeFt);
    }

    // Paced admission spacing: 3_600_000 / cap
    const slotSpacingMs = 3_600_000 / this.requestCapPerHour;
    let slotTime: number;

    if (this.nextSlotSimMs === null) {
      const boundedOffset =
        this.initialSlotOffsetMs !== undefined
          ? this.initialSlotOffsetMs
          : Math.floor(this.rng() * Math.min(slotSpacingMs, 60_000));
      slotTime = simTimeMs + boundedOffset;
    } else {
      let minSlot = Math.max(simTimeMs, this.nextSlotSimMs);
      // Hard rolling simulated hour cap check: at most `cap` admissions in any 3,600,000 ms window
      if (this.admittedTimesSimMs.length >= this.requestCapPerHour) {
        const oldestInWindow =
          this.admittedTimesSimMs[this.admittedTimesSimMs.length - this.requestCapPerHour];
        minSlot = Math.max(minSlot, oldestInWindow + 3_600_000);
      }
      slotTime = minSlot;
    }

    this.admittedTimesSimMs.push(slotTime);
    this.nextSlotSimMs = slotTime + slotSpacingMs;

    const request: VfrPilotRequest = {
      id: `vfr-req-${++this.requestCounter}`,
      aircraftId: aircraft.id,
      callsign: aircraft.callsign,
      kind,
      createdAtSimMs: simTimeMs,
      dueAtSimMs: slotTime,
      state: "PENDING",
      positionNm: { xNm: aircraft.xNm, yNm: aircraft.yNm },
      altitudeFt: aircraft.altitudeFt,
      headingDeg: aircraft.headingDeg,
      ...(aircraft.aircraftType ? { aircraftType: aircraft.aircraftType } : {}),
      ...(destinationAirportId ? { destinationAirportId } : {}),
      ...(requestedAltitudeFt !== undefined ? { requestedAltitudeFt } : {}),
      ...(classBOperation ? { classBOperation } : {}),
      ...(classBIntent ? { classBIntent } : {}),
      ...(originAirportId ? { originAirportId } : {}),
      ...(route ? { route } : {}),
    };

    this.requests.push(request);
  }

  /**
   * Scheduler hook called by T04-74 after an airborne IFR pickup is accepted.
   * Samples ifrCancellationPercent once. If selected, schedules delayed cancellation.
   */
  public scheduleIfrCancellationCandidate(
    aircraft: Aircraft,
    simTimeMs: number,
    options?: { delayMs?: number; log?: SessionLog },
  ): IfrCancellationCandidate | null {
    if (this.ifrCancellationPercent <= 0) {
      return null;
    }
    const roll = this.rng() * 100;
    if (roll >= this.ifrCancellationPercent) {
      return null;
    }

    let delayMs: number;
    if (options?.delayMs !== undefined) {
      delayMs = options.delayMs;
    } else if (typeof this.cancellationDelayOption === "number") {
      delayMs = this.cancellationDelayOption;
    } else if (typeof this.cancellationDelayOption === "function") {
      delayMs = this.cancellationDelayOption(this.rng);
    } else {
      delayMs =
        VFR_CANCEL_DELAY_MIN_MS +
        Math.floor(this.rng() * (VFR_CANCEL_DELAY_MAX_MS - VFR_CANCEL_DELAY_MIN_MS));
    }

    const candidate: IfrCancellationCandidate = {
      id: `vfr-cancel-${++this.cancellationCounter}`,
      aircraftId: aircraft.id,
      callsign: aircraft.callsign,
      scheduledAtSimMs: simTimeMs,
      dueAtSimMs: simTimeMs + delayMs,
      state: "PENDING",
    };

    this.cancellationCandidates.push(candidate);

    const log = options?.log;
    if (log) {
      log.append({
        type: "pilot.cancel_ifr.scheduled",
        atSimMs: simTimeMs,
        atWallMs: 0,
        callsign: aircraft.callsign,
        aircraftId: aircraft.id,
        dueSimMs: candidate.dueAtSimMs,
      });
    }

    return candidate;
  }

  /**
   * Drain requests and cancellation candidates against current simulation time and radio state.
   */
  public drain(args: DrainVfrRequestsArgs): void {
    const { world, log, radio, setStatus, nowWallMs } = args;
    this.worldRef = world;
    const nowWall = nowWallMs ? nowWallMs() : 0;
    this.scheduleFromWorld(world, world.simTimeMs);

    // 1. Drain pending cancellation candidates
    for (const candidate of this.cancellationCandidates) {
      if (candidate.state !== "PENDING" || world.simTimeMs < candidate.dueAtSimMs) {
        continue;
      }

      const aircraft = world.aircraft.find((ac) => ac.id === candidate.aircraftId);
      if (!aircraft) {
        candidate.state = "WITHDRAWN";
        candidate.withdrawnReason = "AIRCRAFT_NOT_FOUND";
        log.append({
          type: "pilot.cancel_ifr.withdrawn",
          atSimMs: world.simTimeMs,
          atWallMs: nowWall,
          callsign: candidate.callsign,
          aircraftId: candidate.aircraftId,
          reason: candidate.withdrawnReason,
        });
        continue;
      }

      const validator = this.cancellationValidator ?? defaultIfrCancellationValidator;
      const validation = validator(aircraft, world);
      if (!validation.ok) {
        candidate.state = "WITHDRAWN";
        candidate.withdrawnReason = validation.reason;
        log.append({
          type: "pilot.cancel_ifr.withdrawn",
          atSimMs: world.simTimeMs,
          atWallMs: nowWall,
          callsign: candidate.callsign,
          aircraftId: candidate.aircraftId,
          reason: validation.reason,
        });
        continue;
      }

      // Check radio availability
      const busy = (radio?.isBusy() ?? false) || this.playInFlight;
      if (!this.canStart(world.simTimeMs, busy)) {
        return;
      }

      candidate.state = "TRANSMITTED";
      aircraft.cancellationPending = true;
      const reportText = `${candidate.callsign}, canceling IFR`;
      setStatus?.(reportText);

      log.append({
        type: "pilot.cancel_ifr.reported",
        atSimMs: world.simTimeMs,
        atWallMs: nowWall,
        callsign: candidate.callsign,
        aircraftId: candidate.aircraftId,
        text: reportText,
      });

      if (radio?.play) {
        this.playInFlight = true;
        this.beginPlay(radio, reportText, candidate.callsign, world.simTimeMs);
      }
      return;
    }

    // Prune stale terminated/withdrawn requests for exited aircraft to avoid unbounded memory leak
    if (world.radioRequests && world.radioRequests.length > 50) {
      const activeIds = new Set(world.aircraft.map((a) => a.id));
      world.radioRequests = world.radioRequests.filter(
        (r) => activeIds.has(r.aircraftId) || r.status === "PENDING" || r.status === "IDENTIFIED",
      );
    }

    // 2. Drain pending VFR pilot requests
    for (;;) {
      const next = this.nextDueRequest(world.simTimeMs);
      if (!next) {
        return;
      }

      const aircraft = world.aircraft.find((ac) => ac.id === next.aircraftId);
      if (!aircraft) {
        this.releaseAdmission(next);
        next.state = "WITHDRAWN";
        next.withdrawnReason = "AIRCRAFT_EXITED";
        log.append({
          type: "vfr.request.withdrawn",
          atSimMs: world.simTimeMs,
          atWallMs: nowWall,
          callsign: next.callsign,
          requestId: next.id,
          reason: next.withdrawnReason,
        });
        continue;
      }

      if (
        aircraft.ambientVfr?.phase === "EXITING" ||
        aircraft.ambientVfr?.phase === "HANDOFF_COMPLETED"
      ) {
        this.releaseAdmission(next);
        next.state = "WITHDRAWN";
        next.withdrawnReason = "AIRCRAFT_EXITED";
        log.append({
          type: "vfr.request.withdrawn",
          atSimMs: world.simTimeMs,
          atWallMs: nowWall,
          callsign: next.callsign,
          requestId: next.id,
          reason: next.withdrawnReason,
        });
        continue;
      }

      if (
        aircraft.flightRules !== "VFR" ||
        aircraft.airborne === false ||
        aircraft.altitudeFt <= 0 ||
        aircraft.activeClearance ||
        aircraft.classBClearance?.active
      ) {
        this.releaseAdmission(next);
        next.state = "WITHDRAWN";
        next.withdrawnReason = "INELIGIBLE_FLIGHT_RULES";
        log.append({
          type: "vfr.request.withdrawn",
          atSimMs: world.simTimeMs,
          atWallMs: nowWall,
          callsign: next.callsign,
          requestId: next.id,
          reason: next.withdrawnReason,
        });
        continue;
      }

      if (next.kind === "CLASS_B_ACCESS") {
        const classBAssessment = assessClassBAccessRequest(aircraft, world, this.regional);
        if (!classBAssessment || !("plan" in classBAssessment)) {
          this.releaseAdmission(next);
          next.state = "WITHDRAWN";
          next.withdrawnReason = "NO_LONGER_REQUIRES_CLASS_B";
          log.append({
            type: "vfr.request.withdrawn",
            atSimMs: world.simTimeMs,
            atWallMs: nowWall,
            callsign: next.callsign,
            requestId: next.id,
            reason: next.withdrawnReason,
          });
          continue;
        }
        if (!classBRequestMatchesPlan(next, classBAssessment.plan)) {
          this.releaseAdmission(next);
          next.state = "WITHDRAWN";
          next.withdrawnReason = "CLASS_B_PLAN_CHANGED";
          log.append({
            type: "vfr.request.withdrawn",
            atSimMs: world.simTimeMs,
            atWallMs: nowWall,
            callsign: next.callsign,
            requestId: next.id,
            reason: next.withdrawnReason,
          });
          this.evaluatedAircraftIds.delete(aircraft.id);
          this.evaluateAircraft(aircraft, world, world.simTimeMs);
          continue;
        }
      }

      // Check radio availability
      const busy = (radio?.isBusy() ?? false) || this.playInFlight;
      if (!this.canStart(world.simTimeMs, busy)) {
        return;
      }

      // Snapshot aircraft position/altitude/heading at transmit time
      next.positionNm = { xNm: aircraft.xNm, yNm: aircraft.yNm };
      next.altitudeFt = aircraft.altitudeFt;
      next.headingDeg = aircraft.headingDeg;
      if (!next.aircraftType && aircraft.aircraftType) {
        next.aircraftType = aircraft.aircraftType;
      }
      if (next.kind === "FLIGHT_FOLLOWING") {
        // VFR cruise is current Mode C: refresh so the spoken altitude and the
        // structured radio-request details always match present altitude.
        next.requestedAltitudeFt = Math.round(aircraft.altitudeFt);
      }
      next.state = "TRANSMITTED";

      const regionalFacility = (world.regional as RegionalFacility | undefined) ?? this.regional;
      const facilityName = regionalFacility?.facilityName?.trim();
      const facilityPrefix = facilityName ? `${facilityName} ` : "";
      const checkInText = `${facilityPrefix}Approach, ${formatRequestCallsign(next.callsign, aircraft.spokenAliases)}`;
      setStatus?.(checkInText);

      log.append({
        type: "vfr.request.transmitted",
        atSimMs: world.simTimeMs,
        atWallMs: nowWall,
        callsign: next.callsign,
        kind: next.kind,
        request: { ...next },
      });

      if (!world.radioRequests) {
        world.radioRequests = [];
      }
      const existingRadioReq = world.radioRequests.find((r) => r.id === next.id);
      if (!existingRadioReq) {
        world.radioRequests.push({
          id: next.id,
          aircraftId: next.aircraftId,
          callsign: next.callsign,
          kind: next.kind,
          requestedAtSimMs: world.simTimeMs,
          status: "PENDING",
          details: {
            aircraftType: next.aircraftType,
            destinationAirportId: next.destinationAirportId,
            requestedAltitudeFt: next.requestedAltitudeFt,
            positionNm: next.positionNm,
            altitudeFt: next.altitudeFt,
            headingDeg: next.headingDeg,
            classBOperation: next.classBOperation,
            classBIntent: next.classBIntent,
            originAirportId: next.originAirportId,
            route: next.route,
          },
        });
      } else {
        existingRadioReq.status = "PENDING";
        existingRadioReq.details = {
          aircraftType: next.aircraftType,
          destinationAirportId: next.destinationAirportId,
          requestedAltitudeFt: next.requestedAltitudeFt,
          positionNm: next.positionNm,
          altitudeFt: next.altitudeFt,
          headingDeg: next.headingDeg,
          classBOperation: next.classBOperation,
          classBIntent: next.classBIntent,
          originAirportId: next.originAirportId,
          route: next.route,
        };
      }

      if (radio?.play) {
        this.playInFlight = true;
        this.beginPlay(radio, checkInText, next.callsign, world.simTimeMs);
      }
      return;
    }
  }

  /**
   * Alias for drain() to satisfy step()-driven callers and lifecycle harnesses.
   */
  public step(args: DrainVfrRequestsArgs): void {
    this.drain(args);
  }

  /**
   * Emit detailed request information after controller 'say request'.
   * Does not consume rolling-hour cap.
   */
  public emitRequestDetails(
    world: World,
    aircraftId: string,
    log?: SessionLog,
    setStatus?: (text: string) => void,
    nowWallMs: () => number = () => Date.now(),
  ): string | undefined {
    const radioReq = world.radioRequests?.find(
      (r) =>
        r.aircraftId === aircraftId &&
        (r.status === "AWAITING_DETAILS" || r.status === "PENDING" || r.status === "STANDBY"),
    );
    if (!radioReq) {
      return undefined;
    }
    const schedReq = this.requests.find((r) => r.id === radioReq.id);
    const aircraft = world.aircraft.find((ac) => ac.id === aircraftId);
    const regionalFacility = (world.regional as RegionalFacility | undefined) ?? this.regional;
    const detailPosition = aircraft
      ? formatVfrPositionReport({ xNm: aircraft.xNm, yNm: aircraft.yNm }, regionalFacility)
      : undefined;
    const detailText =
      radioReq.kind === "CLASS_B_ACCESS"
        ? formatVfrClassBRequest({
            callsign: radioReq.callsign,
            spokenAliases: aircraft?.spokenAliases,
            positionPhrase: detailPosition,
            aircraftType:
              schedReq?.aircraftType ?? radioReq.details.aircraftType ?? aircraft?.aircraftType,
            altitudeFt: schedReq?.altitudeFt ?? radioReq.details.altitudeFt ?? aircraft?.altitudeFt,
            headingDeg: aircraft?.headingDeg ?? radioReq.details.headingDeg,
            classBIntent: radioReq.details.classBIntent ?? "TRANSITION",
            classBOperation: radioReq.details.classBOperation ?? "THROUGH",
            originAirportId: schedReq?.originAirportId ?? radioReq.details.originAirportId,
            destinationAirportId:
              schedReq?.destinationAirportId ?? radioReq.details.destinationAirportId,
            route: schedReq?.route ?? radioReq.details.route,
          })
        : radioReq.kind === "FLIGHT_FOLLOWING"
          ? formatVfrFlightFollowingRequest({
              callsign: radioReq.callsign,
              spokenAliases: aircraft?.spokenAliases,
              positionPhrase: detailPosition ?? undefined,
              aircraftType:
                schedReq?.aircraftType ?? radioReq.details.aircraftType ?? aircraft?.aircraftType,
              destinationAirportId:
                schedReq?.destinationAirportId ?? radioReq.details.destinationAirportId,
              altitudeFt:
                schedReq?.requestedAltitudeFt ??
                radioReq.details.requestedAltitudeFt ??
                radioReq.details.altitudeFt ??
                aircraft?.altitudeFt,
            })
          : formatIfrPickupRequest({
              callsign: radioReq.callsign,
              spokenAliases: aircraft?.spokenAliases,
              positionPhrase: detailPosition ?? undefined,
              aircraftType:
                schedReq?.aircraftType ?? radioReq.details.aircraftType ?? aircraft?.aircraftType,
              destinationAirportId:
                schedReq?.destinationAirportId ?? radioReq.details.destinationAirportId,
              requestedAltitudeFt:
                schedReq?.requestedAltitudeFt ?? radioReq.details.requestedAltitudeFt,
            });
    setStatus?.(detailText);
    log?.append({
      type: "vfr.request.details_reported",
      atSimMs: world.simTimeMs,
      atWallMs: nowWallMs(),
      callsign: radioReq.callsign,
      requestId: radioReq.id,
      text: detailText,
    });
    return detailText;
  }

  private nextDueRequest(simTimeMs: number): VfrPilotRequest | undefined {
    return this.requests
      .filter((req) => req.state === "PENDING" && simTimeMs >= req.dueAtSimMs)
      .sort((a, b) => a.dueAtSimMs - b.dueAtSimMs)[0];
  }

  private canStart(simTimeMs: number, busy: boolean): boolean {
    if (busy) {
      return false;
    }
    if (
      this.lastUtteranceEndSimMs !== null &&
      simTimeMs < this.lastUtteranceEndSimMs + VFR_REQUEST_IDLE_GAP_MS
    ) {
      return false;
    }
    return true;
  }

  private beginPlay(
    radio: VfrRequestRadio,
    text: string,
    callsign: string,
    simTimeMs: number,
  ): void {
    try {
      const result = radio.play?.(text, callsign);
      if (result !== undefined && typeof result.then === "function") {
        void result.then(
          () => {
            this.onPlayEnded(this.worldRef?.simTimeMs ?? simTimeMs);
          },
          () => {
            this.onPlayEnded(this.worldRef?.simTimeMs ?? simTimeMs);
          },
        );
        return;
      }
      this.onPlayEnded(this.worldRef?.simTimeMs ?? simTimeMs);
    } catch {
      this.onPlayEnded(this.worldRef?.simTimeMs ?? simTimeMs);
    }
  }

  private onPlayEnded(simTimeMs: number): void {
    this.playInFlight = false;
    this.lastUtteranceEndSimMs = simTimeMs;
  }
}

export function createVfrRequestQueue(options?: VfrRequestQueueOptions): VfrRequestQueue {
  return new VfrRequestQueue(options);
}
