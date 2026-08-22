import type { TurnDir } from "./command/types";
import { normalizeHeadingDeg } from "./geo/coords";

/**
 * Phase 4 lateral FMS. MSAW inhibit keys on `LOC` | `LANDING` inside FAF.
 * `HEADING` | `DIRECT` | `PROCEDURE` | `MISSED` never inhibit.
 * Omit until a command / FMS sequence sets a mode (treated as heading).
 *
 * `PROCEDURE.routeFixIds` is the resolved STAR path (ids only — positions
 * come from `buildFixRegistry`). Spawn-on-STAR is T04-12.
 */
export type LateralMode =
  | { type: "HEADING"; headingDeg: number }
  | { type: "DIRECT"; fixId: string }
  | {
      type: "PROCEDURE";
      starId: string;
      toFixIndex: number;
      routeFixIds: readonly string[];
    }
  | { type: "INTERCEPT_LOC"; approachId: string }
  | { type: "LOC"; approachId: string }
  | { type: "MISSED"; approachId: string }
  | { type: "LANDING"; approachId: string };

/**
 * Phase 4 vertical FMS. MSAW inhibit keys on `GS` inside FAF.
 * Omit until T04-06 (treated as assigned altitude).
 */
export type CrossRestriction = "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW";

export interface CrossConstraint {
  fixId: string;
  altitudeFt: number;
  restriction: CrossRestriction;
}

export type VerticalMode =
  | { type: "ASSIGNED" }
  | { type: "VIA_STAR"; starId: string; sense?: "DESCEND" | "CLIMB" }
  | { type: "GS"; approachId: string }
  | { type: "MISSED_CLIMB"; altitudeFt: number };

/**
 * Assigned heading / altitude / speed / route. The pilot agent is the only
 * module that may change this from a Command; FMS sequencing in `stepWorld`
 * may write `lateral` / assigned heading when a fix is sequenced.
 */
export interface Intent {
  assignedHeadingDeg: number;
  turn: TurnDir;
  assignedAltitudeFt: number;
  assignedSpeedKt: number;
  /** Phase 1: parsed but not flown. */
  clearedApproachId: string | null;
  lateral?: LateralMode;
  vertical?: VerticalMode;
  /** Single CROSS restriction; cleared when the fix sequences. */
  cross?: CrossConstraint;
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
