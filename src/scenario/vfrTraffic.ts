/**
 * Ambient VFR population, configuration validation, and lifecycle management (T04-71).
 *
 * Implements:
 * - Strict schema validation with stable error strings
 * - Independent seeded PRNG streams for initial placement, mission selection, route choices, and future entries
 * - Separate initial, target, entry-rate, and hard-cap controls
 * - Paced continuous entries at 3,600,000 / entriesPerHour with bounded jitter and no catch-up burst
 * - Soft targetCount maintenance via natural exits/replenishment without mass removal
 * - Hard maxPopulation cap enforcement
 * - Integration with 3D Class B avoidance and autonomous waypoint navigation
 *
 * Generic: no facility-specific branches or hardcoded airport IDs in live logic.
 */

import { mulberry32, performanceRegistry, type Aircraft } from "@core";
import { createAircraft } from "../core/aircraft";
import {
  VFR_TRAINING_BOX_ID,
  VFR_TRAINING_HALF_EXTENT_NM,
  isVfrAvoidanceVolume,
  planSafeVfrRoute,
  stepVfrAircraftNavigation,
  type VfrTrainingBox,
} from "../core/vfrNavigation";
import type { World } from "../core/world";
import type { RegionalAirport, RegionalAirspaceVolume, RegionalFacility } from "./regional";
import type {
  Scenario,
  VfrAircraftMixRow,
  VfrAltitudeMixRow,
  VfrMovementMix,
  VfrRequestConfig,
  VfrTrafficConfig,
} from "./types";

export const VFR_INITIAL_PLACEMENT_XOR = 0x5a1e_7001;
export const VFR_MISSION_ZONE_XOR = 0x5a1e_7002;
export const VFR_ROUTE_XOR = 0x5a1e_7003;
export const VFR_FUTURE_ENTRY_XOR = 0x5a1e_7004;
export const VFR_PILOT_REQUEST_XOR = 0x5a1e_7005;

/** Default VFR fleet, derived from the `generalAviation` catalog object. No hand-listed types. */
export const DEFAULT_VFR_AIRCRAFT_MIX: VfrAircraftMixRow[] = performanceRegistry
  .listGeneralAviationTypes()
  .map((aircraftType) => ({
    aircraftType,
    weight: 1,
    callsignPrefix: "N",
    performanceSource: "PROFILE_REGISTRY" as const,
  }));

export const DEFAULT_VFR_ALTITUDE_MIX: VfrAltitudeMixRow[] = [
  {
    minAltitudeFt: 3000,
    maxAltitudeFt: 5500,
    weight: 1,
  },
];

export const DEFAULT_VFR_MOVEMENT_MIX: VfrMovementMix = {
  localPercent: 100,
  transitPercent: 0,
  airportBoundPercent: 0,
};

/**
 * Fixed trainer movement mix (T04-78): 60/20/20 local/transit/airport-bound.
 * Airport-bound folds to local (80/20/0) when the scenario has no eligible
 * imported controlled-airport destinations (T04-71 no-eligible-destination rule).
 */
export function fixedVfrMovementMix(regional?: RegionalFacility): VfrMovementMix {
  const eligibleDests = getEligibleVfrDestinations(regional);
  if (eligibleDests.length === 0) {
    return { localPercent: 80, transitPercent: 20, airportBoundPercent: 0 };
  }
  return { localPercent: 60, transitPercent: 20, airportBoundPercent: 20 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolve eligible imported controlled B/C/D destination airports from regional facility. */
export function getEligibleVfrDestinations(regional?: RegionalFacility): RegionalAirport[] {
  if (!regional) return [];
  const controlledAirspaces = regional.airspaces.filter(
    (v) => v.type === "CONTROLLED" && (v.class === "B" || v.class === "C" || v.class === "D"),
  );
  const controlledAirportIds = new Set(
    controlledAirspaces
      .map((v) => v.centerAirportId?.toUpperCase())
      .filter((id): id is string => Boolean(id)),
  );

  return regional.airports.filter(
    (apt) =>
      apt.publicUse && apt.runways.length > 0 && controlledAirportIds.has(apt.icao.toUpperCase()),
  );
}

export const DEFAULT_VFR_REQUEST_CONFIG: Required<VfrRequestConfig> = {
  flightFollowingPercent: 0,
  ifrPickupPercent: 0,
  requestCapPerHour: 0,
  ifrCancellationPercent: 0,
};

/**
 * Validate raw or parsed VfrRequestConfig.
 * Throws exact stable loader errors per T04-72.
 */
export function validateVfrRequestConfig(raw: unknown): VfrRequestConfig | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!isRecord(raw)) {
    throw new Error("vfrRequests must be an object");
  }

  let flightFollowingPercent = 0;
  if (raw.flightFollowingPercent !== undefined) {
    if (
      typeof raw.flightFollowingPercent !== "number" ||
      !Number.isFinite(raw.flightFollowingPercent) ||
      raw.flightFollowingPercent < 0 ||
      raw.flightFollowingPercent > 100
    ) {
      throw new Error("vfrRequests.flightFollowingPercent must be in [0, 100]");
    }
    flightFollowingPercent = raw.flightFollowingPercent;
  }

  let ifrPickupPercent = 0;
  if (raw.ifrPickupPercent !== undefined) {
    if (
      typeof raw.ifrPickupPercent !== "number" ||
      !Number.isFinite(raw.ifrPickupPercent) ||
      raw.ifrPickupPercent < 0 ||
      raw.ifrPickupPercent > 100
    ) {
      throw new Error("vfrRequests.ifrPickupPercent must be in [0, 100]");
    }
    ifrPickupPercent = raw.ifrPickupPercent;
  }

  if (flightFollowingPercent + ifrPickupPercent > 100) {
    throw new Error(
      "vfrRequests.flightFollowingPercent + vfrRequests.ifrPickupPercent must be <= 100",
    );
  }

  let requestCapPerHour = 0;
  if (raw.requestCapPerHour !== undefined) {
    if (
      typeof raw.requestCapPerHour !== "number" ||
      !Number.isFinite(raw.requestCapPerHour) ||
      raw.requestCapPerHour < 0
    ) {
      throw new Error("vfrRequests.requestCapPerHour must be a finite number >= 0");
    }
    requestCapPerHour = raw.requestCapPerHour;
  }

  let ifrCancellationPercent = 0;
  if (raw.ifrCancellationPercent !== undefined) {
    if (
      typeof raw.ifrCancellationPercent !== "number" ||
      !Number.isFinite(raw.ifrCancellationPercent) ||
      raw.ifrCancellationPercent < 0 ||
      raw.ifrCancellationPercent > 100
    ) {
      throw new Error("vfrRequests.ifrCancellationPercent must be in [0, 100]");
    }
    ifrCancellationPercent = raw.ifrCancellationPercent;
  }

  return {
    flightFollowingPercent,
    ifrPickupPercent,
    requestCapPerHour,
    ifrCancellationPercent,
  };
}

/**
 * Validate raw or parsed VfrTrafficConfig against scenario context.
 * Throws exact stable loader errors.
 */
export function validateVfrTrafficConfig(
  raw: unknown,
  context?: {
    regional?: RegionalFacility;
  },
): VfrTrafficConfig | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!isRecord(raw)) {
    throw new Error("vfrTraffic must be an object");
  }

  // initialCount
  let initialCount = 0;
  if (raw.initialCount !== undefined) {
    if (
      typeof raw.initialCount !== "number" ||
      !Number.isInteger(raw.initialCount) ||
      raw.initialCount < 0
    ) {
      throw new Error("vfrTraffic.initialCount must be a non-negative integer");
    }
    initialCount = raw.initialCount;
  }

  // targetCount
  let targetCount = 0;
  if (raw.targetCount !== undefined) {
    if (
      typeof raw.targetCount !== "number" ||
      !Number.isInteger(raw.targetCount) ||
      raw.targetCount < 0
    ) {
      throw new Error("vfrTraffic.targetCount must be a non-negative integer");
    }
    targetCount = raw.targetCount;
  }

  // entriesPerHour
  let entriesPerHour = 0;
  if (raw.entriesPerHour !== undefined) {
    if (
      typeof raw.entriesPerHour !== "number" ||
      !Number.isFinite(raw.entriesPerHour) ||
      raw.entriesPerHour < 0
    ) {
      throw new Error("vfrTraffic.entriesPerHour must be a finite number >= 0");
    }
    entriesPerHour = raw.entriesPerHour;
  }

  // maxPopulation
  let maxPopulation = Math.max(initialCount, targetCount);
  if (raw.maxPopulation !== undefined) {
    if (
      typeof raw.maxPopulation !== "number" ||
      !Number.isInteger(raw.maxPopulation) ||
      raw.maxPopulation < 0
    ) {
      throw new Error("vfrTraffic.maxPopulation must be a non-negative integer");
    }
    maxPopulation = raw.maxPopulation;
  }

  if (maxPopulation < initialCount || maxPopulation < targetCount) {
    throw new Error("vfrTraffic.maxPopulation must be >= initialCount and targetCount");
  }

  const isEnabled = initialCount > 0 || targetCount > 0 || entriesPerHour > 0;

  // movementMix
  let movementMix: VfrMovementMix = DEFAULT_VFR_MOVEMENT_MIX;
  if (raw.movementMix !== undefined) {
    if (!isRecord(raw.movementMix)) {
      throw new Error("vfrTraffic.movementMix percentages must sum to 100");
    }
    const local = raw.movementMix.localPercent ?? 0;
    const transit = raw.movementMix.transitPercent ?? 0;
    const airportBound = raw.movementMix.airportBoundPercent ?? 0;

    if (
      typeof local !== "number" ||
      typeof transit !== "number" ||
      typeof airportBound !== "number" ||
      local < 0 ||
      local > 100 ||
      transit < 0 ||
      transit > 100 ||
      airportBound < 0 ||
      airportBound > 100
    ) {
      throw new Error("vfrTraffic.movementMix percentages must sum to 100");
    }

    const sum = local + transit + airportBound;
    if (Math.abs(sum - 100) > 1e-6) {
      throw new Error("vfrTraffic.movementMix percentages must sum to 100");
    }

    movementMix = {
      localPercent: local,
      transitPercent: transit,
      airportBoundPercent: airportBound,
    };

    if (isEnabled && airportBound > 0) {
      const eligibleDests = getEligibleVfrDestinations(context?.regional);
      if (eligibleDests.length === 0) {
        throw new Error("vfrTraffic has no eligible imported controlled-airport destination");
      }
    }
  }

  // aircraftMix
  let aircraftMix: VfrAircraftMixRow[] = DEFAULT_VFR_AIRCRAFT_MIX;
  if (raw.aircraftMix !== undefined) {
    if (!Array.isArray(raw.aircraftMix)) {
      throw new Error("vfrTraffic aircraft mix requires a positive weighted row");
    }
    if (
      isEnabled &&
      !raw.aircraftMix.some((r) => isRecord(r) && typeof r.weight === "number" && r.weight > 0)
    ) {
      throw new Error("vfrTraffic aircraft mix requires a positive weighted row");
    }

    aircraftMix = [];
    for (let i = 0; i < raw.aircraftMix.length; i++) {
      const row = raw.aircraftMix[i];
      if (!isRecord(row)) {
        throw new Error(`vfrTraffic aircraft row ${i} requires a non-empty callsignPrefix`);
      }
      const prefix = row.callsignPrefix;
      if (typeof prefix !== "string" || prefix.trim().length === 0) {
        throw new Error(`vfrTraffic aircraft row ${i} requires a non-empty callsignPrefix`);
      }
      const acType =
        typeof row.aircraftType === "string" ? row.aircraftType.trim().toUpperCase() : "";
      const perfSource = row.performanceSource;

      // VFR fleet lives in the separate `generalAviation` catalog object only.
      // Airliner `aircraft` keys and unlisted types are rejected here.
      if (!acType || !performanceRegistry.hasGeneralAviationType(acType)) {
        throw new Error(
          `vfrTraffic aircraft row ${acType || "<TYPE>"} requires a verified profile or explicit trainer default`,
        );
      }
      if (perfSource !== "TRAINER_DEFAULT" && perfSource !== "PROFILE_REGISTRY") {
        throw new Error(
          `vfrTraffic aircraft row ${acType || "<TYPE>"} requires a verified profile or explicit trainer default`,
        );
      }

      const weight =
        typeof row.weight === "number" && Number.isFinite(row.weight) && row.weight >= 0
          ? row.weight
          : 0;
      aircraftMix.push({
        aircraftType: acType,
        weight,
        callsignPrefix: prefix.trim(),
        performanceSource: perfSource as "PROFILE_REGISTRY" | "TRAINER_DEFAULT",
      });
    }
  }

  // altitudeMix
  let altitudeMix: VfrAltitudeMixRow[] = DEFAULT_VFR_ALTITUDE_MIX;
  if (raw.altitudeMix !== undefined) {
    if (!Array.isArray(raw.altitudeMix)) {
      throw new Error("vfrTraffic altitude mix requires a positive weighted row");
    }
    if (
      isEnabled &&
      !raw.altitudeMix.some((r) => isRecord(r) && typeof r.weight === "number" && r.weight > 0)
    ) {
      throw new Error("vfrTraffic altitude mix requires a positive weighted row");
    }

    altitudeMix = [];
    for (let i = 0; i < raw.altitudeMix.length; i++) {
      const row = raw.altitudeMix[i];
      if (!isRecord(row)) {
        throw new Error(`vfrTraffic altitude row ${i} must have finite bounds with min <= max`);
      }
      const minAlt = row.minAltitudeFt;
      const maxAlt = row.maxAltitudeFt;
      if (
        typeof minAlt !== "number" ||
        typeof maxAlt !== "number" ||
        !Number.isFinite(minAlt) ||
        !Number.isFinite(maxAlt) ||
        minAlt > maxAlt
      ) {
        throw new Error(`vfrTraffic altitude row ${i} must have finite bounds with min <= max`);
      }
      const weight =
        typeof row.weight === "number" && Number.isFinite(row.weight) && row.weight >= 0
          ? row.weight
          : 0;
      altitudeMix.push({
        minAltitudeFt: minAlt,
        maxAltitudeFt: maxAlt,
        weight,
      });
    }
  }

  const seed = typeof raw.seed === "number" && Number.isFinite(raw.seed) ? raw.seed : 1;

  return {
    initialCount,
    targetCount,
    entriesPerHour,
    maxPopulation,
    seed,
    movementMix,
    aircraftMix,
    altitudeMix,
  };
}

/** Weighted random choice helper. */
export function chooseWeighted<T extends { weight: number }>(
  items: readonly T[],
  rng: () => number,
): T {
  const positive = items.filter((item) => item.weight > 0);
  if (positive.length === 0) {
    throw new Error("Cannot choose from items with no positive weight");
  }
  const totalWeight = positive.reduce((acc, item) => acc + item.weight, 0);
  const target = rng() * totalWeight;
  let running = 0;
  for (const item of positive) {
    running += item.weight;
    if (target <= running) {
      return item;
    }
  }
  return positive[positive.length - 1]!;
}

/** Allocate a unique GA callsign with the given prefix. */
export function allocateVfrCallsign(
  rng: () => number,
  used: Set<string>,
  callsignPrefix: string,
): string {
  const prefix = callsignPrefix.trim().toUpperCase();
  for (let attempt = 0; attempt < 500; attempt++) {
    const num = 100 + Math.floor(rng() * 8900); // e.g. 100 to 8999
    const suffix = rng() > 0.5 ? String.fromCharCode(65 + Math.floor(rng() * 26)) : "";
    const callsign = `${prefix}${num}${suffix}`;
    if (!used.has(callsign)) {
      used.add(callsign);
      return callsign;
    }
  }
  throw new Error("Unable to allocate a unique VFR callsign");
}

export interface VfrTrafficManagerInit {
  config: VfrTrafficConfig;
  scenario: Scenario;
  seed: number;
}

/**
 * Manages VFR ambient traffic lifecycle:
 * - Spawning initial population
 * - Continuous entries paced at 3,600,000 / entriesPerHour
 * - Target population maintenance via paced replenishment
 * - Stepping autonomous navigation, waypoint sequencing, and natural exits
 */
export class VfrTrafficManager {
  public readonly config: VfrTrafficConfig;
  /** Fixed ARP-centered training box (T04-77). Named zones were deleted. */
  public readonly trainingBox: VfrTrainingBox;
  public readonly avoidanceVolumes: RegionalAirspaceVolume[];
  public readonly eligibleDestinations: RegionalAirport[];

  private readonly rngPlacement: () => number;
  private readonly rngMission: () => number;
  private readonly rngRoute: () => number;
  private readonly rngEntries: () => number;

  private nextScheduledEntrySimMs: number;
  private readonly usedCallsigns: Set<string>;

  public constructor(init: VfrTrafficManagerInit) {
    this.config = init.config;
    const baseSeed = this.config.seed ?? init.seed;

    this.rngPlacement = mulberry32((baseSeed >>> 0) ^ VFR_INITIAL_PLACEMENT_XOR);
    this.rngMission = mulberry32((baseSeed >>> 0) ^ VFR_MISSION_ZONE_XOR);
    this.rngRoute = mulberry32((baseSeed >>> 0) ^ VFR_ROUTE_XOR);
    this.rngEntries = mulberry32((baseSeed >>> 0) ^ VFR_FUTURE_ENTRY_XOR);

    this.trainingBox = {
      centerNm: { xNm: init.scenario.arpNm.xNm, yNm: init.scenario.arpNm.yNm },
      halfExtentNm: VFR_TRAINING_HALF_EXTENT_NM,
    };

    // Identify Class B avoidance volumes from regional pack
    this.avoidanceVolumes = (init.scenario.regional?.airspaces ?? []).filter(isVfrAvoidanceVolume);
    this.eligibleDestinations = getEligibleVfrDestinations(init.scenario.regional);

    this.usedCallsigns = new Set(
      init.scenario.arrivals.map((a) => (a as { callsign?: string }).callsign ?? ""),
    );

    const entriesPerHour = this.config.entriesPerHour ?? 0;
    if (entriesPerHour > 0) {
      const interval = 3_600_000 / entriesPerHour;
      const jitter = (this.rngEntries() - 0.5) * 0.2 * interval;
      this.nextScheduledEntrySimMs = interval + jitter;
    } else {
      this.nextScheduledEntrySimMs = Number.POSITIVE_INFINITY;
    }
  }

  /** Spawn initial ambient VFR population up to min(initialCount, maxPopulation). */
  public spawnInitialPopulation(world: World): void {
    const initialCount = this.config.initialCount ?? 0;
    const maxPopulation = this.config.maxPopulation ?? initialCount;
    const countToSpawn = Math.min(initialCount, maxPopulation);

    for (let i = 0; i < countToSpawn; i++) {
      this.spawnOneVfrAircraft(world);
    }
  }

  /** Spawn one ambient VFR aircraft using independent seeded streams and 3D Class B avoidance. */
  public spawnOneVfrAircraft(world: World): Aircraft | null {
    const liveVfrCount = world.aircraft.filter((a) => a.ambientVfr !== undefined).length;
    const maxPop = this.config.maxPopulation ?? 100;
    if (liveVfrCount >= maxPop) {
      return null;
    }

    // 1. Select mission from movementMix (rngMission draw order unchanged after zone deletion)
    const mix = this.config.movementMix ?? DEFAULT_VFR_MOVEMENT_MIX;
    const localP = mix.localPercent ?? 100;
    const transitP = mix.transitPercent ?? 0;
    const mRoll = this.rngMission() * 100;
    let mission: "LOCAL" | "TRANSIT" | "AIRPORT_BOUND" = "LOCAL";
    if (mRoll < localP) {
      mission = "LOCAL";
    } else if (mRoll < localP + transitP) {
      mission = "TRANSIT";
    } else {
      mission = "AIRPORT_BOUND";
    }

    // If AIRPORT_BOUND, select an eligible destination
    let destinationAirport: RegionalAirport | undefined;
    if (mission === "AIRPORT_BOUND") {
      if (this.eligibleDestinations.length === 0) {
        mission = "LOCAL";
      } else {
        const destIdx = Math.floor(this.rngMission() * this.eligibleDestinations.length);
        destinationAirport = this.eligibleDestinations[destIdx];
      }
    }

    // 2. Select aircraft type & callsign
    const acMixRow = chooseWeighted(
      this.config.aircraftMix ?? DEFAULT_VFR_AIRCRAFT_MIX,
      this.rngPlacement,
    );
    const callsign = allocateVfrCallsign(
      this.rngPlacement,
      this.usedCallsigns,
      acMixRow.callsignPrefix,
    );

    // 3. Select altitude
    const altMixRow = chooseWeighted(
      this.config.altitudeMix ?? DEFAULT_VFR_ALTITUDE_MIX,
      this.rngPlacement,
    );
    const altRange = altMixRow.maxAltitudeFt - altMixRow.minAltitudeFt;
    const altFt =
      Math.round((altMixRow.minAltitudeFt + this.rngPlacement() * altRange) / 100) * 100;

    const speedKt = 110;

    // 4. Plan safe route avoiding Class B volumes (uniform training-box sampling)
    const plannedRoute = planSafeVfrRoute({
      mission,
      box: this.trainingBox,
      altitudeFt: altFt,
      speedKt,
      destinationAirport,
      avoidanceVolumes: this.avoidanceVolumes,
      rng: this.rngRoute,
    });

    if (!plannedRoute) {
      // Bounded attempts exhausted: record structured skipped event and do not spawn
      world.sessionLog?.append({
        type: "vfr.spawn.skipped",
        reason: "NO_SAFE_ROUTE",
        atSimMs: world.simTimeMs,
        atWallMs: 0,
      });
      return null;
    }

    const { spawnPose, waypoints } = plannedRoute;
    const dwellDurationMs = 600_000 + Math.floor(this.rngPlacement() * 600_000); // 10-20 min

    // 5. Build Aircraft with explicit VFR/1200/ambient marker
    const ac = createAircraft({
      callsign,
      xNm: spawnPose.xNm,
      yNm: spawnPose.yNm,
      headingDeg: spawnPose.headingDeg,
      altitudeFt: spawnPose.altitudeFt,
      speedKt: spawnPose.speedKt,
      aircraftType: acMixRow.aircraftType,
      squawk: "1200",
      reportedSquawk: "1200",
      transponder: "mode_c",
      flightRules: "VFR",
      ambientVfr: {
        mission,
        zoneId: VFR_TRAINING_BOX_ID,
        ...(destinationAirport ? { destinationAirportId: destinationAirport.icao } : {}),
        spawnedAtSimMs: world.simTimeMs,
        alertEligibility: "AMBIENT_SUPPRESSED",
        waypoints,
        waypointIndex: 0,
        dwellUntilSimMs: world.simTimeMs + dwellDurationMs,
      },
    });

    world.aircraft.push(ac);

    world.sessionLog?.append({
      type: "vfr.spawned",
      callsign: ac.callsign,
      mission,
      zoneId: VFR_TRAINING_BOX_ID,
      atSimMs: world.simTimeMs,
      atWallMs: 0,
    });

    return ac;
  }

  /**
   * Step simulation for VFR traffic:
   * - Progresses waypoint navigation
   * - Removes naturally exiting traffic
   * - Performs continuous deterministic schedule entries
   * - Maintains soft targetCount
   */
  public step(world: World, dtS: number): void {
    if (dtS <= 0) {
      return; // Simulation paused
    }

    // 1. Step waypoint navigation for all active ambient VFR aircraft
    const remainingAircraft: Aircraft[] = [];
    for (const ac of world.aircraft) {
      if (ac.ambientVfr) {
        const navResult = stepVfrAircraftNavigation(
          ac,
          world.simTimeMs,
          world.navigation.magVarDeg,
          world.sessionLog,
          this.avoidanceVolumes,
        );
        if (navResult.exited) {
          // Natural exit / tower handoff completed: remove from world
          continue;
        }
      }
      remainingAircraft.push(ac);
    }
    world.aircraft = remainingAircraft;

    const liveVfrCount = world.aircraft.filter((a) => a.ambientVfr !== undefined).length;
    const maxPop = this.config.maxPopulation ?? 100;
    const entriesPerHour = this.config.entriesPerHour ?? 0;

    // 2. Scheduled continuous entry pacing
    if (entriesPerHour > 0 && world.simTimeMs >= this.nextScheduledEntrySimMs) {
      const interval = 3_600_000 / entriesPerHour;
      const jitter = (this.rngEntries() - 0.5) * 0.2 * interval;
      this.nextScheduledEntrySimMs = world.simTimeMs + interval + jitter;

      if (liveVfrCount < maxPop) {
        this.spawnOneVfrAircraft(world);
      }
      // If at or above maxPop, entry is deferred without catch-up burst
    }

    // 3. Target population maintenance
    const targetCount = this.config.targetCount ?? 0;
    if (liveVfrCount < targetCount && liveVfrCount < maxPop && entriesPerHour === 0) {
      this.spawnOneVfrAircraft(world);
    }
  }
}
