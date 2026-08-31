/**
 * Pilot-agent validation bounds (phase 1 README / Command IR).
 * Reject the entire Command if any instruction fails — no partial apply.
 */

import type {
  Aircraft,
  FixRegistry,
  Instruction,
  ProcedureJoinCatalog,
  VerticalCatalog,
} from "@core";
import { isOnCourseToFix, joinProcedureTransition } from "@core";

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
  | "NOT_ON_APPROACH";

export type ValidateResult = { ok: true } | { ok: false; reason: ValidateReason; detail?: string };

export interface ValidateOpts {
  fixRegistry?: FixRegistry | null;
  catalog?: (VerticalCatalog & ProcedureJoinCatalog) | null;
  /** Scenario active runway; runway-tagged STAR transitions must match. */
  activeRunwayId?: string | null;
  /** When set (catalog loaded), CLEARED/EXPECT must match an approach id. */
  approachIds?: readonly string[] | null;
}

/** Against present kinematics, not would-be assigned values in the same Command. */
export function validateInstructions(
  aircraft: Aircraft,
  instructions: Instruction[],
  opts?: ValidateOpts,
): ValidateResult {
  if (instructions.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }
  for (const instruction of instructions) {
    const result = validateOne(aircraft, instruction, opts);
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

function validateOne(
  aircraft: Aircraft,
  instruction: Instruction,
  opts?: ValidateOpts,
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
      return validateAltitude(aircraft, instruction);
    case "SPEED":
      if (
        !Number.isFinite(instruction.speedKt) ||
        instruction.speedKt < SPEED_MIN_KT ||
        instruction.speedKt > SPEED_MAX_KT
      ) {
        return { ok: false, reason: "SPEED" };
      }
      return { ok: true };
    case "CLEARED_APPROACH":
    case "INTERCEPT_LOCALIZER":
    case "EXPECT_APPROACH":
      if (instruction.approachId.trim() === "") {
        return { ok: false, reason: "EMPTY" };
      }
      if (!approachKnown(instruction.approachId, opts)) {
        return { ok: false, reason: "UNKNOWN_APPROACH" };
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
      return validateCross(aircraft, instruction, opts);
    case "GO_AROUND":
      if (!aircraft.intent.clearedApproachId) {
        return { ok: false, reason: "NOT_ON_APPROACH" };
      }
      return { ok: true };
    case "PRESENT_HEADING":
    case "IDENT":
    case "SAY_HEADING":
    case "SAY_ALTITUDE":
      return { ok: true };
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}

function headingInRange(headingDeg: number): boolean {
  return Number.isFinite(headingDeg) && headingDeg >= 0 && headingDeg < 360;
}

function isAltitudeValid(altitudeFt: number): boolean {
  return (
    Number.isFinite(altitudeFt) &&
    altitudeFt % 100 === 0 &&
    altitudeFt >= ALTITUDE_MIN_FT &&
    altitudeFt <= ALTITUDE_MAX_FT
  );
}

function approachKnown(approachId: string, opts?: ValidateOpts): boolean {
  if (!opts?.approachIds) {
    return true;
  }
  const want = approachId.trim().toUpperCase();
  return opts.approachIds.some((id) => id.trim().toUpperCase() === want);
}

function validateAltitude(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "ALTITUDE" }>,
): ValidateResult {
  const ft = instruction.altitudeFt;
  if (!isAltitudeValid(ft)) {
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
): ValidateResult {
  if (instruction.fixId.trim() === "") {
    return { ok: false, reason: "EMPTY" };
  }
  if (!isAltitudeValid(instruction.altitudeFt)) {
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
