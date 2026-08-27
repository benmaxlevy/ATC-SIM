/**
 * Analog: JO 7110.65 Chapter 3 Section 9 / FAA Terminal Departure Flow Rates.
 * Randomized and customizable departure traffic generator.
 * Schedules departures periodically off the active runway, uniformly distributing
 * them across available catalog SIDs and enroute transitions without callsign collisions.
 */

import { mulberry32, type Aircraft, type ScheduledDeparture, type World } from "@core";
import type { ProcedureCatalog } from "./procedures/types";
import { spawnDeparture } from "./departureSpawn";

export const DEFAULT_DEPARTURE_RATE_PER_HOUR = 10;
export const DEFAULT_DEPARTURE_COUNT = 10;
export const MIN_DEPARTURE_INTERVAL_S = 90;
export const DEPARTURE_STREAM_XOR = 0x51d5;

export const DEPARTURE_AIRLINES = [
  "AAL",
  "DAL",
  "UAL",
  "SWA",
  "JBU",
  "NKS",
  "ASA",
  "FFT",
  "SKW",
  "RPA",
] as const;

export const DEPARTURE_AIRCRAFT_TYPES = ["B738", "A320", "B737", "A321", "E75L"] as const;

export const DEPARTURE_ASSIGNED_ALTITUDES_FT = [10000, 12000, 14000, 16000] as const;

export interface DepartureSlot {
  sidId: string;
  transitionId: string;
}

export interface GenerateDepartureScheduleOptions {
  catalog: ProcedureCatalog;
  seed: number;
  ratePerHour?: number;
  count?: number;
  runwayId?: string;
  activeCallsigns?: Iterable<string> | readonly string[];
  startSimMs?: number;
}

/**
 * List all available (sidId, transitionId) slots for a given runway.
 */
export function listDepartureSlots(catalog: ProcedureCatalog, runwayId?: string): DepartureSlot[] {
  const slots: DepartureSlot[] = [];
  const cleanRwy = runwayId ? runwayId.replace(/^RW/i, "").trim().toUpperCase() : undefined;

  for (const sid of catalog.sids) {
    if (cleanRwy && sid.runwayTransitions && sid.runwayTransitions.length > 0) {
      const matches = sid.runwayTransitions.some(
        (rt) => rt.runwayId.replace(/^RW/i, "").trim().toUpperCase() === cleanRwy,
      );
      if (!matches) {
        continue;
      }
    }
    if (sid.enrouteTransitions && sid.enrouteTransitions.length > 0) {
      for (const et of sid.enrouteTransitions) {
        if (cleanRwy && et.runwayTransitions && et.runwayTransitions.length > 0) {
          const matches = et.runwayTransitions.some(
            (rt) => rt.runwayId.replace(/^RW/i, "").trim().toUpperCase() === cleanRwy,
          );
          if (!matches) {
            continue;
          }
        }
        slots.push({ sidId: sid.id, transitionId: et.id });
      }
    } else {
      slots.push({ sidId: sid.id, transitionId: "" });
    }
  }

  return slots;
}

/**
 * Generate a deterministic schedule of departures using mulberry32 PRNG.
 */
export function generateDepartureSchedule(
  options: GenerateDepartureScheduleOptions,
): ScheduledDeparture[] {
  const {
    catalog,
    seed,
    ratePerHour = DEFAULT_DEPARTURE_RATE_PER_HOUR,
    count = DEFAULT_DEPARTURE_COUNT,
    runwayId = "27",
    activeCallsigns = [],
    startSimMs = 0,
  } = options;

  if (count <= 0) {
    return [];
  }

  const slots = listDepartureSlots(catalog, runwayId);
  if (slots.length === 0) {
    throw new Error(`No SID departure slots found for runway ${runwayId}`);
  }

  const rng = mulberry32((seed >>> 0) ^ DEPARTURE_STREAM_XOR);
  const usedCallsigns = new Set<string>();
  for (const cs of activeCallsigns) {
    usedCallsigns.add(cs.trim().toUpperCase());
  }

  const avgIntervalS = 3600 / Math.max(0.1, ratePerHour);
  const schedule: ScheduledDeparture[] = [];
  let currentSimMs = startSimMs + Math.round(Math.max(60, MIN_DEPARTURE_INTERVAL_S) * 1000);

  for (let i = 0; i < count; i += 1) {
    // 1. Uniformly sample available (sidId, transitionId) slots
    let slot: DepartureSlot;
    if (i < slots.length) {
      slot = slots[i]!;
    } else {
      const idx = Math.floor(rng() * slots.length);
      slot = slots[idx]!;
    }

    // 2. Pick non-colliding callsign
    const airline = DEPARTURE_AIRLINES[Math.floor(rng() * DEPARTURE_AIRLINES.length)]!;
    let flightNum = 100 + Math.floor(rng() * 900);
    let callsign = `${airline}${flightNum}`;
    while (usedCallsigns.has(callsign)) {
      flightNum = 100 + ((flightNum - 100 + 1) % 900);
      callsign = `${airline}${flightNum}`;
    }
    usedCallsigns.add(callsign);

    // 3. Pick aircraft type and assigned top altitude
    const aircraftType =
      DEPARTURE_AIRCRAFT_TYPES[Math.floor(rng() * DEPARTURE_AIRCRAFT_TYPES.length)]!;
    const assignedAltitudeFt =
      DEPARTURE_ASSIGNED_ALTITUDES_FT[Math.floor(rng() * DEPARTURE_ASSIGNED_ALTITUDES_FT.length)]!;

    // 4. Calculate spawn timestamp with separation >= MIN_DEPARTURE_INTERVAL_S
    if (i > 0) {
      const jitter = 0.9 + 0.2 * rng();
      const intervalS = Math.max(MIN_DEPARTURE_INTERVAL_S, Math.round(avgIntervalS * jitter));
      currentSimMs += intervalS * 1000;
    }

    schedule.push({
      callsign,
      sidId: slot.sidId,
      transitionId: slot.transitionId,
      runwayId,
      assignedAltitudeFt,
      aircraftType,
      scheduledSimMs: currentSimMs,
      spawned: false,
    });
  }

  return schedule;
}

/**
 * Evaluates world.scheduledDepartures and spawns any aircraft due at world.simTimeMs.
 */
export function spawnDueDepartures(world: World): Aircraft[] {
  if (!world.scheduledDepartures || world.scheduledDepartures.length === 0) {
    return [];
  }
  const spawned: Aircraft[] = [];
  for (const dep of world.scheduledDepartures) {
    if (!dep.spawned && world.simTimeMs >= dep.scheduledSimMs) {
      dep.spawned = true;
      const ac = spawnDeparture(world, {
        callsign: dep.callsign,
        runwayId: dep.runwayId,
        sidId: dep.sidId,
        transitionId: dep.transitionId || undefined,
        assignedAltitudeFt: dep.assignedAltitudeFt,
        aircraftType: dep.aircraftType,
      });
      world.sessionLog?.append({
        type: "departure.spawned",
        atSimMs: world.simTimeMs,
        atWallMs: 0,
        callsign: dep.callsign,
        sidId: dep.sidId,
        transitionId: dep.transitionId || undefined,
        runwayId: dep.runwayId,
      });
      spawned.push(ac);
    }
  }
  return spawned;
}
