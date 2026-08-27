import { createAircraft, offerInboundHandoff, mulberry32, type Aircraft, type World } from "@core";
import { assignStarRoutes, type StarRouteAssignment } from "./starSpawn";
import type { ProcedureCatalog } from "./procedures/types";

/** Trainer traffic-density bounds; arrivals/hour is not a radio frequency. */
export const ARRIVALS_PER_HOUR_MIN = 0;
export const ARRIVALS_PER_HOUR_MAX = 60;
export const DEFAULT_INITIAL_ARRIVAL_COUNT = 6;
export const DEFAULT_ARRIVALS_PER_HOUR = 12;
export const DEFAULT_ARRIVAL_SCHEDULE_COUNT = 30;

export interface ArrivalTrafficConfig {
  initialArrivalCount?: number;
  arrivalsPerHour?: number;
  seed?: number;
}

export interface ValidatedArrivalTrafficConfig {
  initialArrivalCount: number;
  arrivalsPerHour: number;
  seed: number;
}

export interface ScheduledArrival {
  callsign: string;
  assignment: StarRouteAssignment;
  scheduledSimMs: number;
  spawned: boolean;
}

export interface ArrivalScheduler {
  readonly config: ValidatedArrivalTrafficConfig;
  readonly schedule: readonly ScheduledArrival[];
  drain(world: World): Aircraft[];
}

function boundedInteger(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}] (got ${String(value)})`);
  }
  return value;
}

function boundedRate(value: number): number {
  if (!Number.isFinite(value) || value < ARRIVALS_PER_HOUR_MIN || value > ARRIVALS_PER_HOUR_MAX) {
    throw new Error(
      `arrivalsPerHour must be in [${ARRIVALS_PER_HOUR_MIN}, ${ARRIVALS_PER_HOUR_MAX}] (got ${String(value)})`,
    );
  }
  return value;
}

export function validateArrivalTrafficConfig(
  config: ArrivalTrafficConfig = {},
): ValidatedArrivalTrafficConfig {
  return {
    initialArrivalCount: boundedInteger(
      config.initialArrivalCount ?? DEFAULT_INITIAL_ARRIVAL_COUNT,
      0,
      30,
      "initialArrivalCount",
    ),
    arrivalsPerHour: boundedRate(config.arrivalsPerHour ?? DEFAULT_ARRIVALS_PER_HOUR),
    seed: boundedInteger(config.seed ?? 1, 0, 0xffffffff, "seed"),
  };
}

const AIRLINES = ["DAL", "AAL", "UAL", "SWA", "JBU", "NKS", "ASA", "FFT", "SKW", "RPA"] as const;

function callsignSequence(count: number, seed: number, reserved: readonly string[]): string[] {
  const used = new Set(reserved.map((callsign) => callsign.toUpperCase()));
  const preferred = reserved.slice(0, count).map((callsign) => callsign.toUpperCase());
  const rng = mulberry32(seed >>> 0);
  const result: string[] = [];
  let index = 0;
  while (result.length < count) {
    const preferredCallsign = preferred[result.length];
    if (preferredCallsign && !result.includes(preferredCallsign)) {
      used.add(preferredCallsign);
      result.push(preferredCallsign);
      continue;
    }
    const candidate = `${AIRLINES[Math.floor(rng() * AIRLINES.length)]}${200 + Math.floor(rng() * 800)}`;
    index += 1;
    const callsign = used.has(candidate)
      ? `${AIRLINES[index % AIRLINES.length]}${100 + index}`
      : candidate;
    if (!used.has(callsign)) {
      used.add(callsign);
      result.push(callsign);
    }
  }
  return result;
}

function spawnScheduledArrival(world: World, arrival: ScheduledArrival): Aircraft {
  const { pose } = arrival.assignment;
  const aircraft = createAircraft({
    callsign: arrival.callsign,
    xNm: pose.xNm,
    yNm: pose.yNm,
    headingDeg: pose.headingDeg,
    altitudeFt: pose.altitudeFt,
    speedKt: pose.speedKt,
    aircraftType: "B738",
  });
  aircraft.intent.lateral = {
    type: "PROCEDURE",
    starId: arrival.assignment.starId,
    toFixIndex: 0,
    routeFixIds: pose.routeFixIds,
  };
  aircraft.intent.vertical = {
    type: "VIA_STAR",
    starId: arrival.assignment.starId,
    sense: "DESCEND",
  };
  world.aircraft.push(aircraft);
  offerInboundHandoff(world, aircraft);
  return aircraft;
}

export function createArrivalScheduler(
  catalog: ProcedureCatalog,
  config: ArrivalTrafficConfig = {},
  reservedCallsigns: readonly string[] = [],
  startSimMs = 0,
): ArrivalScheduler {
  const validated = validateArrivalTrafficConfig(config);
  const initialCount = validated.initialArrivalCount;
  const futureCount =
    validated.arrivalsPerHour === 0
      ? 0
      : Math.max(0, DEFAULT_ARRIVAL_SCHEDULE_COUNT - initialCount);
  const assignments = assignStarRoutes({
    catalog,
    count: initialCount + futureCount,
    seed: validated.seed,
  });
  const callsigns = callsignSequence(
    initialCount + futureCount,
    validated.seed ^ 0xa24baed,
    reservedCallsigns,
  );
  const intervalMs =
    validated.arrivalsPerHour === 0
      ? Number.POSITIVE_INFINITY
      : 3_600_000 / validated.arrivalsPerHour;
  const schedule = assignments.map((assignment, index) => ({
    callsign: callsigns[index]!,
    assignment,
    scheduledSimMs:
      index < initialCount ? startSimMs : startSimMs + (index - initialCount + 1) * intervalMs,
    spawned: false,
  }));

  return {
    config: validated,
    schedule,
    drain(world) {
      const spawned: Aircraft[] = [];
      for (const arrival of schedule) {
        if (arrival.spawned || arrival.scheduledSimMs > world.simTimeMs) continue;
        arrival.spawned = true;
        spawned.push(spawnScheduledArrival(world, arrival));
      }
      return spawned;
    },
  };
}
