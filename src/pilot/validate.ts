/**
 * Pilot-agent validation bounds (phase 1 README / Command IR).
 * Reject the entire Command if any instruction fails — no partial apply.
 */

import type {
  Aircraft,
  AircraftPerformanceProfile,
  FixRegistry,
  Instruction,
  ProcedureJoinCatalog,
  RadioRequest,
  VerticalCatalog,
} from "@core";
import {
  alongTrackNm,
  findOpenRadioRequest,
  isAircraftInsideClassB,
  isOnCourseToFix,
  planSafeVfrContinuation,
  joinProcedureTransition,
  normalizeHeading,
  performanceRegistry,
} from "@core";
import { isValidBeaconCode } from "@core";
import {
  normalizeRunwayId,
  resolveRegionalRunwayGeometryForAircraft,
  resolveRunwayGeometry,
} from "../core/nav/approachContext";
import type { World } from "../core/world";
import type { RegionalFacility } from "../scenario/regional";

export const ALTITUDE_MIN_FT = 1000;
export const ALTITUDE_MAX_FT = 18000;
export const SPEED_MIN_KT = 150;
export const SPEED_MAX_KT = 280;
export const TURN_DEGREES_MIN = 1;
export const TURN_DEGREES_MAX = 180;

export type ValidateReason =
  | "EMPTY"
  | "HEADING"
  | "ALTITUDE"
  | "SPEED"
  | "CLIMB_NOT_ABOVE"
  | "DESCEND_NOT_BELOW"
  | "UNKNOWN_FIX"
  | "UNKNOWN_PROCEDURE"
  | "UNKNOWN_TRANSITION"
  | "AMBIGUOUS_TRANSITION"
  | "NOT_ON_COURSE"
  | "UNKNOWN_APPROACH"
  | "NOT_ON_APPROACH"
  | "SQUAWK"
  | "CLEARANCE"
  | "REQUEST"
  | "RADAR_CONTACT"
  | "CANCELLATION"
  | "RUNWAY";

export type ValidateResult = { ok: true } | { ok: false; reason: ValidateReason; detail?: string };

export interface ValidateApproach {
  id: string;
  type?: string;
  runway?: string;
  fafDistanceNm?: number;
  fafFixId?: string;
  thresholdFixId?: string;
  courseDeg?: number;
  publishedCourseMagneticDeg?: number;
}

export interface ValidateOpts {
  fixRegistry?: FixRegistry | null;
  catalog?:
    | (VerticalCatalog &
        ProcedureJoinCatalog & {
          approaches?: ReadonlyArray<ValidateApproach>;
          fixes?: ReadonlyArray<{ id: string }>;
          navaids?: ReadonlyArray<{ id: string }>;
          airportId?: string;
        })
    | null;
  /** Scenario active runway; runway-tagged STAR transitions must match. */
  activeRunwayId?: string | null;
  /** When set (catalog loaded), CLEARED/EXPECT must match an approach id. */
  approachIds?: readonly string[] | null;
  /** When set, CLEARED_VISUAL runway must match an id in this list. */
  runwayIds?: readonly string[] | null;
  destinationIcao?: string | null;
  performanceProfile?: AircraftPerformanceProfile | null;
  radioRequests?: readonly RadioRequest[];
  regional?: RegionalFacility | null;
  world?: World | null;
  vfrContinuationValidator?: (aircraft: Aircraft, regional?: RegionalFacility | null) => boolean;
}

const REQUEST_CONTROL_TYPES = new Set([
  "REQUEST_DETAILS",
  "STANDBY_REQUEST",
  "APPROVE_FLIGHT_FOLLOWING",
  "DECLINE_REQUEST",
  "RADAR_CONTACT",
  "TERMINATE_RADAR_SERVICE",
  "ACKNOWLEDGE_IFR_CANCELLATION",
]);

/** Against present kinematics, not would-be assigned values in the same Command. */
export function validateInstructions(
  aircraft: Aircraft,
  instructions: Instruction[],
  opts?: ValidateOpts,
): ValidateResult {
  if (instructions.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }
  if (
    instructions.length > 1 &&
    instructions.some((instruction) => REQUEST_CONTROL_TYPES.has(instruction.type))
  ) {
    const hasCancel = instructions.some((i) => i.type === "ACKNOWLEDGE_IFR_CANCELLATION");
    return {
      ok: false,
      reason: hasCancel ? "CANCELLATION" : "CLEARANCE",
      detail: hasCancel
        ? "cancellation instruction must be the only instruction"
        : "request control instruction must be the only instruction",
    };
  }
  const profile = opts?.performanceProfile ?? performanceRegistry.getProfile(aircraft.aircraftType);
  if (instructions.some((instruction) => instruction.type === "CANCEL_APPROACH")) {
    return validateProjectedCancellation(aircraft, instructions, opts, profile);
  }
  for (const instruction of instructions) {
    const result = validateOne(aircraft, instruction, opts, profile);
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

/**
 * Cancellation is a lifecycle boundary inside a single transmission. Validate
 * later instructions against a copy of intent, then let handleRadioCommand
 * apply the original list only after every instruction passes.
 */
function validateProjectedCancellation(
  aircraft: Aircraft,
  instructions: Instruction[],
  opts: ValidateOpts | undefined,
  profile: AircraftPerformanceProfile | null,
): ValidateResult {
  const cancellationIndexes = instructions.reduce<number[]>((indexes, instruction, index) => {
    if (instruction.type === "CANCEL_APPROACH") indexes.push(index);
    return indexes;
  }, []);
  if (cancellationIndexes[0] !== 0) {
    return {
      ok: false,
      reason: "CLEARANCE",
      detail: "CANCEL_APPROACH must be the first instruction",
    };
  }
  if (cancellationIndexes.length !== 1) {
    return {
      ok: false,
      reason: "CLEARANCE",
      detail: "CANCEL_APPROACH may be issued only once",
    };
  }
  if (
    instructions
      .slice(1)
      .some((instruction) =>
        new Set([
          "CLEARED_APPROACH",
          "CLEARED_VISUAL",
          "INTERCEPT_LOCALIZER",
          "EXPECT_APPROACH",
          "GO_AROUND",
          "IFR_CLEARANCE",
        ]).has(instruction.type),
      )
  ) {
    return {
      ok: false,
      reason: "CLEARANCE",
      detail: "CANCEL_APPROACH cannot be followed by approach or go-around instructions",
    };
  }

  const projected = cloneAircraftForValidation(aircraft);
  const cancellation = validateCancellation(projected);
  if (!cancellation.ok) {
    return cancellation;
  }
  projectCancellation(projected);

  for (const instruction of instructions.slice(1)) {
    const result = validateOne(projected, instruction, opts, profile);
    if (!result.ok) {
      return result;
    }
    projectAfterCancellation(projected, instruction);
  }
  return { ok: true };
}

function cloneAircraftForValidation(aircraft: Aircraft): Aircraft {
  return {
    ...aircraft,
    intent: {
      ...aircraft.intent,
      lateral: aircraft.intent.lateral ? { ...aircraft.intent.lateral } : undefined,
      vertical: aircraft.intent.vertical ? { ...aircraft.intent.vertical } : undefined,
    },
  };
}

function validateCancellation(aircraft: Aircraft): ValidateResult {
  const onApproach =
    Boolean(aircraft.intent.clearedApproachId) || aircraft.intent.lateral?.type === "VISUAL_FINAL";
  if (
    !onApproach ||
    aircraft.intent.lateral?.type === "MISSED" ||
    aircraft.intent.lateral?.type === "LANDING"
  ) {
    return { ok: false, reason: "NOT_ON_APPROACH" };
  }
  return { ok: true };
}

function projectCancellation(aircraft: Aircraft): void {
  aircraft.intent.assignedHeadingDeg = aircraft.headingDeg;
  aircraft.intent.turn = "SHORTEST";
  aircraft.intent.clearedApproachId = null;
  aircraft.intent.locInterceptApproachId = null;
  aircraft.intent.expectedApproachId = null;
  if (aircraft.intent.vertical?.type === "GS") {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }
  const lateralType = aircraft.intent.lateral?.type;
  if (
    lateralType === undefined ||
    lateralType === "HEADING" ||
    lateralType === "INTERCEPT_LOC" ||
    lateralType === "LOC" ||
    lateralType === "VISUAL_FINAL"
  ) {
    aircraft.intent.lateral = { type: "HEADING", headingDeg: aircraft.headingDeg };
  }
}

function projectAfterCancellation(aircraft: Aircraft, instruction: Instruction): void {
  switch (instruction.type) {
    case "FLY_HEADING":
      projectHeading(aircraft, instruction.headingDeg, instruction.turn);
      return;
    case "TURN_DEGREES":
      projectHeading(
        aircraft,
        normalizeHeading(
          aircraft.headingDeg +
            (instruction.direction === "LEFT" ? -instruction.degrees : instruction.degrees),
        ),
        instruction.direction,
      );
      return;
    case "PRESENT_HEADING":
      projectHeading(aircraft, aircraft.headingDeg, "SHORTEST");
      return;
    default:
      return;
  }
}

function projectHeading(
  aircraft: Aircraft,
  headingDeg: number,
  turn: Aircraft["intent"]["turn"],
): void {
  aircraft.intent.assignedHeadingDeg = headingDeg;
  aircraft.intent.turn = turn;
  aircraft.intent.lateral = { type: "HEADING", headingDeg };
  aircraft.intent.clearedApproachId = null;
  aircraft.intent.locInterceptApproachId = null;
  if (
    aircraft.intent.vertical?.type === "VIA_STAR" ||
    aircraft.intent.vertical?.type === "VIA_SID" ||
    aircraft.intent.vertical?.type === "GS" ||
    aircraft.intent.vertical?.type === "MISSED_CLIMB"
  ) {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }
  aircraft.intent.cross = undefined;
}

function validateOne(
  aircraft: Aircraft,
  instruction: Instruction,
  opts?: ValidateOpts,
  profile?: AircraftPerformanceProfile | null,
): ValidateResult {
  switch (instruction.type) {
    case "FLY_HEADING":
      if (!headingInRange(instruction.headingDeg)) {
        return { ok: false, reason: "HEADING" };
      }
      return { ok: true };
    case "TURN_DEGREES":
      if (
        !Number.isFinite(instruction.degrees) ||
        instruction.degrees < TURN_DEGREES_MIN ||
        instruction.degrees > TURN_DEGREES_MAX
      ) {
        return { ok: false, reason: "HEADING" };
      }
      return { ok: true };
    case "ALTITUDE":
      return validateAltitude(aircraft, instruction, profile, opts);
    case "SPEED":
      return validateSpeed(aircraft, instruction, profile, opts);
    case "CLEARED_APPROACH":
    case "INTERCEPT_LOCALIZER":
    case "EXPECT_APPROACH":
      if (instruction.approachId.trim() === "") {
        return { ok: false, reason: "EMPTY" };
      }
      if (
        !approachKnown(instruction.approachId, opts) ||
        !isIlsApproach(instruction.approachId, opts)
      ) {
        return { ok: false, reason: "UNKNOWN_APPROACH" };
      }
      return { ok: true };
    case "CLEARED_VISUAL":
      return validateClearedVisual(aircraft, instruction, opts);
    case "ASSIGN_SQUAWK":
      if (
        !isValidBeaconCode(instruction.code) ||
        (instruction.source === "VFR" && instruction.code !== "1200")
      ) {
        return { ok: false, reason: "SQUAWK" };
      }
      return { ok: true };
    case "MAINTAIN_VFR":
      return { ok: true };
    case "CLASS_B_CLEARANCE":
    case "REMAIN_OUTSIDE_BRAVO":
    case "RESUME_APPROPRIATE_VFR_ALTITUDES":
      return {
        ok: false,
        reason: "CLEARANCE",
        detail: "Class B clearance execution is implemented by the downstream ticket",
      };
    case "IFR_CLEARANCE":
      if (instruction.limitId.trim() === "") {
        return { ok: false, reason: "CLEARANCE" };
      }
      if (
        instruction.access.type === "EXPLICIT_ROUTE" &&
        instruction.access.segments.some((segment) =>
          segment.type === "DIRECT"
            ? segment.fixId.trim() === ""
            : segment.procedureId.trim() === "" ||
              (segment.transitionId !== undefined && segment.transitionId.trim() === ""),
        )
      ) {
        return { ok: false, reason: "CLEARANCE" };
      }
      if (instruction.access.type === "FIX_THEN_DIRECT" && instruction.access.fixId.trim() === "") {
        return { ok: false, reason: "CLEARANCE" };
      }
      if (instruction.access.type === "SID" && instruction.access.procedureId.trim() === "") {
        return { ok: false, reason: "CLEARANCE" };
      }
      if (
        instruction.altitudeFt !== undefined &&
        (!Number.isInteger(instruction.altitudeFt) || instruction.altitudeFt % 100 !== 0)
      ) {
        return { ok: false, reason: "CLEARANCE" };
      }
      return { ok: true };
    case "DIRECT":
      if (instruction.fixId.trim() === "") {
        return { ok: false, reason: "EMPTY" };
      }
      if (!opts?.fixRegistry?.has(instruction.fixId)) {
        return { ok: false, reason: "UNKNOWN_FIX" };
      }
      return { ok: true };
    case "DESCEND_VIA":
    case "CLIMB_VIA":
    case "JOIN_PROCEDURE":
      return validateDescendViaOrJoin(aircraft, instruction, opts);
    case "CROSS":
      return validateCross(aircraft, instruction, opts, profile);
    case "GO_AROUND":
      if (!aircraft.intent.clearedApproachId && aircraft.intent.lateral?.type !== "VISUAL_FINAL") {
        return { ok: false, reason: "NOT_ON_APPROACH" };
      }
      return { ok: true };
    case "CANCEL_APPROACH":
      return validateCancellation(aircraft);
    case "PRESENT_HEADING":
    case "IDENT":
    case "SAY_HEADING":
    case "SAY_ALTITUDE":
    case "DELETE_SPEED_RESTRICTIONS":
      return { ok: true };
    case "REQUEST_DETAILS": {
      const openReq = findOpenRadioRequest(opts?.radioRequests, aircraft.id);
      if (!openReq) {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: no pending radio request" };
      }
      if (openReq.status === "APPROVED") {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: request is already resolved" };
      }
      return { ok: true };
    }
    case "STANDBY_REQUEST": {
      const openReq = findOpenRadioRequest(opts?.radioRequests, aircraft.id);
      if (!openReq) {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: no pending radio request" };
      }
      if (openReq.status === "APPROVED") {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: request is already resolved" };
      }
      return { ok: true };
    }
    case "APPROVE_FLIGHT_FOLLOWING": {
      const openReq = findOpenRadioRequest(opts?.radioRequests, aircraft.id, "FLIGHT_FOLLOWING");
      if (!openReq) {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: no pending radio request" };
      }
      if (openReq.status !== "IDENTIFIED") {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: radar identification required" };
      }
      return { ok: true };
    }
    case "DECLINE_REQUEST": {
      const openReq = findOpenRadioRequest(opts?.radioRequests, aircraft.id, instruction.service);
      if (!openReq) {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: no pending radio request" };
      }
      if (openReq.status === "APPROVED") {
        return {
          ok: false,
          reason: "REQUEST",
          detail: "REQUEST: active service must be terminated",
        };
      }
      return { ok: true };
    }
    case "RADAR_CONTACT": {
      // Bare `radar contact` identifies with no position report; a present
      // position must be complete (positive distance + known fix/navaid).
      if (
        instruction.distanceNm === undefined &&
        instruction.referenceId === undefined &&
        instruction.referenceKind === undefined
      ) {
        const openReq = findOpenRadioRequest(opts?.radioRequests, aircraft.id);
        if (!openReq) {
          return { ok: false, reason: "REQUEST", detail: "REQUEST: no pending radio request" };
        }
        return { ok: true };
      }
      if (!Number.isFinite(instruction.distanceNm) || (instruction.distanceNm ?? 0) <= 0) {
        return {
          ok: false,
          reason: "RADAR_CONTACT",
          detail: "RADAR_CONTACT: distance must be positive",
        };
      }
      const refId = (instruction.referenceId ?? "").trim().toUpperCase();
      if (!refId) {
        return { ok: false, reason: "UNKNOWN_FIX", detail: "UNKNOWN_FIX" };
      }
      // Airport references live in their own namespace: the own-airport id or
      // a regional airport, never the fix/navaid catalog.
      if (instruction.referenceKind === "AIRPORT") {
        const regionalAirports = opts?.regional?.airports;
        const knownAirport =
          opts?.catalog?.airportId?.trim().toUpperCase() === refId ||
          (Array.isArray(regionalAirports) &&
            regionalAirports.some((a) => a?.icao?.toUpperCase() === refId));
        if (!knownAirport) {
          return { ok: false, reason: "UNKNOWN_FIX", detail: "UNKNOWN_FIX" };
        }
      } else {
        const catalogHasFix =
          opts?.fixRegistry?.has(refId) ||
          opts?.catalog?.fixes?.some((f) => f.id.trim().toUpperCase() === refId) ||
          opts?.catalog?.navaids?.some((n) => n.id.trim().toUpperCase() === refId);
        if (!catalogHasFix) {
          return { ok: false, reason: "UNKNOWN_FIX", detail: "UNKNOWN_FIX" };
        }
      }
      const openReq = findOpenRadioRequest(opts?.radioRequests, aircraft.id);
      if (!openReq) {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: no pending radio request" };
      }
      return { ok: true };
    }
    case "TERMINATE_RADAR_SERVICE": {
      if (!aircraft.flightFollowing?.active && !aircraft.radarContact) {
        return { ok: false, reason: "REQUEST", detail: "REQUEST: radar service is not active" };
      }
      return { ok: true };
    }
    case "ACKNOWLEDGE_IFR_CANCELLATION": {
      if (!aircraft.cancellationPending) {
        return {
          ok: false,
          reason: "CANCELLATION",
          detail: "CANCELLATION: no pending pilot IFR cancellation",
        };
      }
      if (aircraft.flightRules !== "IFR") {
        return {
          ok: false,
          reason: "CANCELLATION",
          detail: "CANCELLATION: aircraft is not operating IFR",
        };
      }
      if (aircraft.altitudeFt <= 0 || aircraft.airborne === false) {
        return {
          ok: false,
          reason: "CANCELLATION",
          detail: "CANCELLATION: aircraft is on ground",
        };
      }
      if (isAircraftInsideClassB(aircraft, opts?.regional)) {
        return {
          ok: false,
          reason: "CANCELLATION",
          detail: "CANCELLATION: cannot cancel IFR inside Class B airspace",
        };
      }
      if (opts?.vfrContinuationValidator) {
        if (!opts.vfrContinuationValidator(aircraft, opts.regional)) {
          return {
            ok: false,
            reason: "CANCELLATION",
            detail: "CANCELLATION: unable to establish safe VFR continuation",
          };
        }
      } else if (!planSafeVfrContinuation(aircraft, opts?.regional)) {
        return {
          ok: false,
          reason: "CANCELLATION",
          detail: "CANCELLATION: unable to establish safe VFR continuation",
        };
      }
      return { ok: true };
    }
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}

function headingInRange(headingDeg: number): boolean {
  return Number.isFinite(headingDeg) && headingDeg >= 0 && headingDeg < 360;
}

function isAltitudeValid(altitudeFt: number, maxFt: number = ALTITUDE_MAX_FT): boolean {
  return (
    Number.isFinite(altitudeFt) &&
    altitudeFt % 100 === 0 &&
    altitudeFt >= ALTITUDE_MIN_FT &&
    altitudeFt <= maxFt
  );
}

function approachKnown(approachId: string, opts?: ValidateOpts): boolean {
  if (!opts?.approachIds) {
    return true;
  }
  const want = approachId.trim().toUpperCase();
  return opts.approachIds.some((id) => id.trim().toUpperCase() === want);
}

function isIlsApproach(approachId: string, opts?: ValidateOpts): boolean {
  const norm = approachId.trim().toUpperCase();
  const approach = opts?.catalog?.approaches?.find((a) => a.id.trim().toUpperCase() === norm);
  if (approach) {
    if (approach.type) {
      return approach.type.toUpperCase() === "ILS";
    }
  }
  if (
    norm.includes("RNAV") ||
    norm.includes("VOR") ||
    norm.includes("NDB") ||
    norm.includes("RNP") ||
    norm.includes("VISUAL")
  ) {
    return false;
  }
  return true;
}

function validateClearedVisual(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "CLEARED_VISUAL" }>,
  opts?: ValidateOpts,
): ValidateResult {
  const raw = instruction.runwayId.trim();
  if (raw === "") {
    return { ok: false, reason: "EMPTY" };
  }
  const clean = raw.replace(/^RW/i, "").toUpperCase();
  if (!/^\d{1,2}[LRC]?$/.test(clean)) {
    return { ok: false, reason: "RUNWAY" };
  }
  const norm = normalizeRunwayId(clean);

  if (opts?.world) {
    return resolveRunwayGeometry(aircraft, norm, opts.world)
      ? { ok: true }
      : { ok: false, reason: "RUNWAY" };
  }

  if (opts?.runwayIds) {
    const matches = opts.runwayIds.some((id) => normalizeRunwayId(id) === norm);
    if (!matches) {
      return { ok: false, reason: "RUNWAY" };
    }
  }

  if (opts?.regional) {
    return resolveRegionalRunwayGeometryForAircraft(
      aircraft,
      norm,
      opts.regional,
      opts.destinationIcao,
    )
      ? { ok: true }
      : { ok: false, reason: "RUNWAY" };
  }

  if (opts?.catalog) {
    const cat = opts.catalog;
    const approachRunways = (cat.approaches ?? [])
      .map((a) => a.runway ?? a.id.replace(/^ILS/i, ""))
      .filter(Boolean);
    const thresholdFixes = (cat.fixes ?? [])
      .filter((f) => f.id.toUpperCase().startsWith("RW"))
      .map((f) => f.id.replace(/^RW/i, ""));
    const allKnown = [...approachRunways, ...thresholdFixes];
    if (allKnown.length > 0) {
      const exists = allKnown.some((r) => normalizeRunwayId(r) === norm);
      if (!exists) {
        return { ok: false, reason: "RUNWAY" };
      }
      return { ok: true };
    }
  }

  return { ok: false, reason: "RUNWAY" };
}

function validateAltitude(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "ALTITUDE" }>,
  profile?: AircraftPerformanceProfile | null,
  opts?: ValidateOpts,
): ValidateResult {
  if (aircraft.intent.clearedApproachId || aircraft.intent.lateral?.type === "VISUAL_FINAL") {
    const isIls = aircraft.intent.clearedApproachId
      ? isIlsApproach(aircraft.intent.clearedApproachId, opts)
      : false;
    return {
      ok: false,
      reason: "ALTITUDE",
      detail: isIls
        ? "unable. cleared for the ILS already."
        : "unable. cleared for the approach already.",
    };
  }

  const ft = instruction.altitudeFt;
  if (!Number.isFinite(ft) || ft % 100 !== 0 || ft < ALTITUDE_MIN_FT) {
    return { ok: false, reason: "ALTITUDE" };
  }
  if (profile?.limits?.serviceCeilingFt !== undefined) {
    if (ft > profile.limits.serviceCeilingFt) {
      return {
        ok: false,
        reason: "ALTITUDE",
        detail: `unable altitude ${ft}, ceiling is ${profile.limits.serviceCeilingFt}`,
      };
    }
  } else if (ft > ALTITUDE_MAX_FT) {
    return { ok: false, reason: "ALTITUDE" };
  }
  if (instruction.verb === "CLIMB" && ft <= aircraft.altitudeFt) {
    return { ok: false, reason: "CLIMB_NOT_ABOVE" };
  }
  if (instruction.verb === "DESCEND" && ft >= aircraft.altitudeFt) {
    return { ok: false, reason: "DESCEND_NOT_BELOW" };
  }
  return { ok: true };
}

function validateSpeed(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "SPEED" }>,
  profile?: AircraftPerformanceProfile | null,
  opts?: ValidateOpts,
): ValidateResult {
  if (!Number.isFinite(instruction.speedKt)) {
    return { ok: false, reason: "SPEED" };
  }

  const approachId =
    aircraft.intent.clearedApproachId ??
    (aircraft.intent.lateral?.type === "LOC" ||
    aircraft.intent.lateral?.type === "LANDING" ||
    aircraft.intent.lateral?.type === "INTERCEPT_LOC"
      ? aircraft.intent.lateral.approachId
      : undefined);

  const approach = approachId
    ? opts?.catalog?.approaches?.find(
        (a) => a.id.trim().toUpperCase() === approachId.trim().toUpperCase(),
      )
    : opts?.catalog?.approaches?.[0];

  const hardBoundaryNm = Math.min(approach?.fafDistanceNm ?? 5, 5);
  const boundaryName = hardBoundaryNm === 5 ? "5 DME" : "final approach fix";

  const thresholdPoint =
    approach?.thresholdFixId && opts?.fixRegistry?.has(approach.thresholdFixId)
      ? opts.fixRegistry.get(approach.thresholdFixId)!
      : { xNm: 0, yNm: 0 };

  let courseDeg = approach?.publishedCourseMagneticDeg ?? approach?.courseDeg;
  if (courseDeg === undefined) {
    const match = approachId ? /(\d{1,2})[LCR]?$/i.exec(approachId) : null;
    courseDeg = match ? Number.parseInt(match[1], 10) * 10 : 270;
  }

  const isClearedOrOnApproach = Boolean(approachId);
  if (isClearedOrOnApproach) {
    const aircraftDistNm = alongTrackNm(aircraft, thresholdPoint, courseDeg);
    if (aircraftDistNm <= hardBoundaryNm) {
      return {
        ok: false,
        reason: "SPEED",
        detail: `unable. restriction too close to ${boundaryName}`,
      };
    }
  }

  if (instruction.until) {
    if (instruction.until.type === "DME") {
      if (instruction.until.distanceNm < hardBoundaryNm) {
        return {
          ok: false,
          reason: "SPEED",
          detail: `unable. restriction too close to ${boundaryName}`,
        };
      }
    } else if (instruction.until.type === "FIX") {
      const fix = opts?.fixRegistry?.get(instruction.until.fixId);
      if (fix) {
        const fixDistNm = alongTrackNm(fix, thresholdPoint, courseDeg);
        if (fixDistNm < hardBoundaryNm) {
          return {
            ok: false,
            reason: "SPEED",
            detail: `unable. restriction too close to ${boundaryName}`,
          };
        }
      }
    }
  }

  const minKt =
    profile?.limits?.minControlledSpeedKt && profile.limits.minControlledSpeedKt > 0
      ? profile.limits.minControlledSpeedKt
      : SPEED_MIN_KT;
  const maxKt =
    profile?.limits?.maxControlledSpeedKt && Number.isFinite(profile.limits.maxControlledSpeedKt)
      ? profile.limits.maxControlledSpeedKt
      : SPEED_MAX_KT;

  if (instruction.speedKt < minKt) {
    return {
      ok: false,
      reason: "SPEED",
      detail: `unable speed ${instruction.speedKt}, minimum is ${minKt}`,
    };
  }
  if (instruction.speedKt > maxKt) {
    return {
      ok: false,
      reason: "SPEED",
      detail: `unable speed ${instruction.speedKt}, maximum is ${maxKt}`,
    };
  }
  return { ok: true };
}

function onPublishedProcedure(
  aircraft: Aircraft,
  procedureId: string,
): Extract<Aircraft["intent"]["lateral"], { type: "PROCEDURE" }> | undefined {
  const lateral = aircraft.intent.lateral;
  if (lateral?.type !== "PROCEDURE") {
    return undefined;
  }
  const want = procedureId.trim().toUpperCase();
  const star = lateral.starId?.trim().toUpperCase();
  const sid = lateral.sidId?.trim().toUpperCase();
  if (star !== want && sid !== want) {
    return undefined;
  }
  return lateral;
}

function remainingProcedureFixIds(aircraft: Aircraft, procedureId: string): string[] | undefined {
  const lateral = onPublishedProcedure(aircraft, procedureId);
  return lateral ? lateral.routeFixIds.slice(lateral.toFixIndex) : undefined;
}

function currentProcedureRouteFixIds(
  aircraft: Aircraft,
  procedureId: string,
): readonly string[] | undefined {
  return onPublishedProcedure(aircraft, procedureId)?.routeFixIds;
}

function validateDescendViaOrJoin(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "DESCEND_VIA" | "CLIMB_VIA" | "JOIN_PROCEDURE" }>,
  opts?: ValidateOpts,
): ValidateResult {
  const known = validateVia(instruction.procedureId, opts);
  if (!known.ok) {
    return known;
  }
  if (!instruction.transitionId) {
    return { ok: true };
  }
  const resolved = joinProcedureTransition({
    catalog: opts?.catalog,
    procedureId: instruction.procedureId,
    transitionId: instruction.transitionId,
    activeRunwayId: opts?.activeRunwayId,
    remainingFixIds: remainingProcedureFixIds(aircraft, instruction.procedureId),
    currentRouteFixIds: currentProcedureRouteFixIds(aircraft, instruction.procedureId),
  });
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  return { ok: true };
}

function validateVia(procedureId: string, opts?: ValidateOpts): ValidateResult {
  if (procedureId.trim() === "") {
    return { ok: false, reason: "EMPTY" };
  }
  const want = procedureId.trim().toUpperCase();
  const stars = opts?.catalog?.stars ?? [];
  const sids = opts?.catalog?.sids ?? [];
  const known =
    stars.some((star) => star.id.trim().toUpperCase() === want) ||
    sids.some((sid) => sid.id.trim().toUpperCase() === want);
  if (!known) {
    return { ok: false, reason: "UNKNOWN_PROCEDURE" };
  }
  return { ok: true };
}

function validateCross(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "CROSS" }>,
  opts?: ValidateOpts,
  profile?: AircraftPerformanceProfile | null,
): ValidateResult {
  if (instruction.fixId.trim() === "") {
    return { ok: false, reason: "EMPTY" };
  }
  const maxFt = profile?.limits?.serviceCeilingFt ?? ALTITUDE_MAX_FT;
  if (!isAltitudeValid(instruction.altitudeFt, maxFt)) {
    return { ok: false, reason: "ALTITUDE" };
  }
  if (!opts?.fixRegistry?.has(instruction.fixId)) {
    return { ok: false, reason: "UNKNOWN_FIX" };
  }
  if (!isOnCourseToFix(aircraft, instruction.fixId)) {
    return { ok: false, reason: "NOT_ON_COURSE", detail: instruction.fixId };
  }
  return { ok: true };
}
