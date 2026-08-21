import type { TurnDir } from "./command/types";
import { normalizeHeadingDeg } from "./geo/coords";

/**
 * Assigned heading / altitude / speed / route. The pilot agent is the only
 * module that may change this from a Command; this module only defines data.
 */
export interface Intent {
  assignedHeadingDeg: number;
  turn: TurnDir;
  assignedAltitudeFt: number;
  assignedSpeedKt: number;
  /** Phase 1: parsed but not flown. */
  clearedApproachId: string | null;
}

/**
 * One simulated aircraft. Tracks are 1:1 with aircraft (no sensor error).
 * Kinematics (where it is) live on these fields; Intent is what it is flying.
 */
export interface Aircraft {
  id: string;
  callsign: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  intent: Intent;
  /** Sim time when IDENT flash ends; 0 = inactive. */
  identUntilSimMs: number;
  /**
   * ICAO type stub for the full datablock line 3 (e.g. B738).
   * Display-only — kinematics ignore this.
   */
  aircraftType?: string;
}

export interface AircraftInit {
  id?: string;
  callsign: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  /** Optional type stub copied onto Aircraft; does not affect kinematics. */
  aircraftType?: string;
}

let aircraftSeq = 0;

/** Deterministic `ac-n` ids so Vitest does not depend on `crypto.randomUUID`. */
export function nextAircraftId(): string {
  aircraftSeq += 1;
  return `ac-${aircraftSeq}`;
}

/**
 * Build an aircraft in equilibrium: assigned heading/altitude/speed equal the
 * present state so T01-03 with no commands stays straight and level.
 */
export function createAircraft(init: AircraftInit): Aircraft {
  const headingDeg = normalizeHeadingDeg(init.headingDeg);
  return {
    id: init.id ?? nextAircraftId(),
    callsign: init.callsign.toUpperCase(),
    xNm: init.xNm,
    yNm: init.yNm,
    headingDeg,
    altitudeFt: init.altitudeFt,
    speedKt: init.speedKt,
    intent: {
      assignedHeadingDeg: headingDeg,
      turn: "SHORTEST",
      assignedAltitudeFt: init.altitudeFt,
      assignedSpeedKt: init.speedKt,
      clearedApproachId: null,
    },
    identUntilSimMs: 0,
    ...(init.aircraftType ? { aircraftType: init.aircraftType.toUpperCase() } : {}),
  };
}

const TEST_AIRCRAFT_DEFAULTS: AircraftInit = {
  callsign: "DAL123",
  xNm: 10,
  yNm: 5,
  headingDeg: 90,
  altitudeFt: 8000,
  speedKt: 220,
};

/** Fixture for later tests. Ids are stable only when `overrides.id` is set. */
export function makeTestAircraft(overrides?: Partial<AircraftInit>): Aircraft {
  return createAircraft({ ...TEST_AIRCRAFT_DEFAULTS, ...overrides });
}
