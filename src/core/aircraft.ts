import type { TurnDir } from "./command/types";
import { normalizeHeadingDeg } from "./nav/geometry";

/**
 * Phase 4 lateral FMS. MSAW inhibit keys on `LOC` | `LANDING` inside FAF.
 * `HEADING` | `DIRECT` | `PROCEDURE` | `MISSED` never inhibit.
 * Omit until a command / FMS sequence sets a mode (treated as heading).
 *
 * `PROCEDURE.routeFixIds` is the resolved STAR path (ids only — positions
 * come from `buildFixRegistry`). Spawn-on-STAR with VIA is T04-12.
 */
export type LateralMode =
  | { type: "HEADING"; headingDeg: number }
  | { type: "DIRECT"; fixId: string }
  | {
      type: "PROCEDURE";
      starId?: string;
      sidId?: string;
      toFixIndex: number;
      routeFixIds: readonly string[];
    }
  | { type: "INTERCEPT_LOC"; approachId: string }
  | { type: "LOC"; approachId: string }
  | { type: "MISSED"; approachId: string }
  | { type: "LANDING"; approachId: string };

/**
 * Phase 4 vertical FMS. MSAW inhibit keys on `GS` inside FAF.
 * Omit (treated as assigned altitude) until VIA / GS / missed is armed.
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
  | { type: "VIA_SID"; sidId: string }
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
  /** Altitude explicitly assigned by controller via radio/command (e.g. C40, D30). Omitted when locked to STAR/SID or default altitude. */
  controllerAssignedAltitudeFt?: number;
  assignedSpeedKt: number;
  /** Speed explicitly assigned by controller via radio/command (e.g. S210). Omitted when locked to STAR/SID or default speed. */
  controllerAssignedSpeedKt?: number;
  /** Scratchpad only — EXPECT_APPROACH does not capture. */
  expectedApproachId: string | null;
  /** Armed ILS id after CLEARED_APPROACH; heading instructions clear this. */
  clearedApproachId: string | null;
  /**
   * Loc intercept armed by `IL` / `APP`. Capture may fire while still
   * `DIRECT` / `PROCEDURE` / `HEADING`. Heading instructions clear this.
   */
  locInterceptApproachId: string | null;
  /**
   * Tower stub (T04-12) may set this so DA does not start missed.
   * Default omitted/false. Honor `lateral === LANDING` the same way.
   */
  landingCleared?: boolean;
  lateral?: LateralMode;
  vertical?: VerticalMode;
  /** Single CROSS restriction; cleared when the fix sequences. */
  cross?: CrossConstraint;
  /** Requested cruise/entry altitude in feet MSL. */
  requestedAltitudeFt?: number;
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
  /** Assigned or active 4-digit beacon/squawk code (e.g. "1200", "0342"). */
  squawk?: string;
  /** Transponder capability / mode ("primary", "mode_c", "mode_a", "mode_s", "none"). */
  transponder?: "primary" | "mode_c" | "mode_a" | "mode_s" | "none";
  /** True if primary radar target only (no beacon / transponder). */
  primaryOnly?: boolean;
  /** True if primary radar target only. */
  isPrimary?: boolean;
  /** Wake turbulence or RNAV / CWT category indicator letter (e.g. "H", "B", "R", "L", "A"-"I"). */
  wakeCategory?: string;
  /** Special Purpose Code: "EM" (7700), "RF" (7600), "HJ" (7500), or explicit SPC tag. */
  spc?: string;
  /** Filed / requested cruise or entry altitude in feet MSL (e.g. 7000 for R070). */
  requestedAltitudeFt?: number;
  /** Assigned squawk code when tracking squawk mismatch. */
  assignedSquawk?: string;
  /** Reported squawk code when tracking squawk mismatch. */
  reportedSquawk?: string;
  /** True if altitude is pilot-reported (displays *). */
  pilotReportedAltitude?: boolean;
  /** ATPA in-trail distance readout (Fig 38/39 two decimals, e.g. "2.40"). */
  atpaDistance?: string;
}

export interface AircraftInit {
  id?: string;
  callsign: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  aircraftType?: string;
  squawk?: string;
  transponder?: "primary" | "mode_c" | "mode_a" | "mode_s" | "none";
  primaryOnly?: boolean;
  isPrimary?: boolean;
  wakeCategory?: string;
  spc?: string;
  requestedAltitudeFt?: number;
  assignedSquawk?: string;
  reportedSquawk?: string;
  pilotReportedAltitude?: boolean;
  atpaDistance?: string;
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
      expectedApproachId: null,
      clearedApproachId: null,
      locInterceptApproachId: null,
    },
    identUntilSimMs: 0,
    ...(init.aircraftType ? { aircraftType: init.aircraftType.toUpperCase() } : {}),
    ...(init.squawk ? { squawk: init.squawk } : {}),
    ...(init.transponder ? { transponder: init.transponder } : {}),
    ...(init.primaryOnly !== undefined ? { primaryOnly: init.primaryOnly } : {}),
    ...(init.isPrimary !== undefined ? { isPrimary: init.isPrimary } : {}),
    ...(init.wakeCategory ? { wakeCategory: init.wakeCategory.toUpperCase() } : {}),
    ...(init.spc ? { spc: init.spc.toUpperCase() } : {}),
    ...(init.requestedAltitudeFt !== undefined
      ? { requestedAltitudeFt: init.requestedAltitudeFt }
      : {}),
    ...(init.assignedSquawk ? { assignedSquawk: init.assignedSquawk } : {}),
    ...(init.reportedSquawk ? { reportedSquawk: init.reportedSquawk } : {}),
    ...(init.pilotReportedAltitude !== undefined
      ? { pilotReportedAltitude: init.pilotReportedAltitude }
      : {}),
    ...(init.atpaDistance ? { atpaDistance: init.atpaDistance } : {}),
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
