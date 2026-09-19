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
  mulberry32,
  type Aircraft,
  type IfrCancellationCandidate,
  type IfrCancellationState,
  type SessionLog,
  type VfrPilotRequest,
  type VfrPilotRequestKind,
  type VfrPilotRequestState,
  type World,
} from "@core";
import {
  extractVolumePolygonNm,
  isPointInsideAvoidanceVolumes,
  isSafeVfrContinuationAvailable,
  isVfrAvoidanceVolume,
  pointInPolygon2D,
} from "../core/vfrNavigation";
import {
  DEFAULT_VFR_REQUEST_CONFIG,
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

const VFR_POSITION_CARDINALS = [
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
 * Format a VFR flight-following callup with aircraft type, destination, and
 * altitude, e.g. "N123, 15 miles north of KPDK, C172, request flight
 * following to KFTY at 4500".
 *
 * Generic: destination/altitude segments are omitted only when unknown so
 * callers with sparse data still produce a valid fallback call.
 */
export function formatVfrFlightFollowingRequest(args: {
  callsign: string;
  positionPhrase?: string;
  aircraftType?: string;
  destinationAirportId?: string;
  altitudeFt?: number;
}): string {
  const typeText = args.aircraftType ?? "type unknown";
  const segments = [args.callsign];
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
  if (aircraft.activeClearance) {
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
    if (!isSafeVfrContinuationAvailable(aircraft, regional)) {
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

    this.evaluatedAircraftIds.add(aircraft.id);

    const roll = this.rng() * 100;
    let kind: VfrPilotRequestKind | null = null;
    if (roll < this.flightFollowingPercent) {
      kind = "FLIGHT_FOLLOWING";
    } else if (roll < this.flightFollowingPercent + this.ifrPickupPercent) {
      kind = "IFR_PICKUP";
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

    // Determine destination and requested altitude for IFR_PICKUP
    let destinationAirportId: string | undefined;
    let requestedAltitudeFt: number | undefined;

    if (kind === "IFR_PICKUP") {
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
              if (typeof apt?.icao !== "string" || !apt?.arpNm) {
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

    // 1.5 Handle requests awaiting details after controller 'say request'
    if (world.radioRequests && !this.playInFlight && !(radio?.isBusy() ?? false)) {
      const awaiting = world.radioRequests.find((r) => r.status === "AWAITING_DETAILS");
      if (awaiting) {
        const text = this.emitRequestDetails(world, awaiting.aircraftId, log, setStatus, nowWallMs);
        if (text) {
          awaiting.status = "PENDING";
          if (radio?.play) {
            this.playInFlight = true;
            this.beginPlay(radio, text, awaiting.callsign, world.simTimeMs);
          }
          return;
        }
      }
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

      if (aircraft.flightRules !== "VFR" || aircraft.activeClearance) {
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
      const positionPhrase = formatVfrPositionReport(
        { xNm: aircraft.xNm, yNm: aircraft.yNm },
        regionalFacility,
      );
      const requestText =
        next.kind === "FLIGHT_FOLLOWING"
          ? formatVfrFlightFollowingRequest({
              callsign: next.callsign,
              positionPhrase: positionPhrase ?? undefined,
              aircraftType: next.aircraftType ?? aircraft.aircraftType,
              destinationAirportId: next.destinationAirportId,
              altitudeFt: next.requestedAltitudeFt ?? next.altitudeFt,
            })
          : positionPhrase
            ? `${next.callsign}, ${positionPhrase}, request IFR to ${next.destinationAirportId ?? "destination"}`
            : `${next.callsign}, request IFR to ${next.destinationAirportId ?? "destination"}`;
      setStatus?.(requestText);

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
          },
        });
      }

      if (radio?.play) {
        this.playInFlight = true;
        this.beginPlay(radio, requestText, next.callsign, world.simTimeMs);
      }
      return;
    }
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
        r.aircraftId === aircraftId && (r.status === "AWAITING_DETAILS" || r.status === "PENDING"),
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
      radioReq.kind === "FLIGHT_FOLLOWING"
        ? formatVfrFlightFollowingRequest({
            callsign: radioReq.callsign,
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
        : detailPosition
          ? `${radioReq.callsign}, ${detailPosition}, request IFR to ${schedReq?.destinationAirportId ?? "destination"}`
          : `${radioReq.callsign}, request IFR to ${schedReq?.destinationAirportId ?? "destination"}`;
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
            this.onPlayEnded(simTimeMs);
          },
          () => {
            this.onPlayEnded(simTimeMs);
          },
        );
        return;
      }
      this.onPlayEnded(simTimeMs);
    } catch {
      this.onPlayEnded(simTimeMs);
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
