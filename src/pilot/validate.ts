/**
 * Pilot-agent validation bounds (phase 1 README / Command IR).
 * Reject the entire Command if any instruction fails — no partial apply.
 */

import type { Aircraft, FixRegistry, Instruction } from "@core";

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
  | "UNKNOWN_FIX";

export type ValidateResult = { ok: true } | { ok: false; reason: ValidateReason };

export interface ValidateOpts {
  fixRegistry?: FixRegistry | null;
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
      if (instruction.approachId.trim() === "") {
        return { ok: false, reason: "EMPTY" };
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
    case "PRESENT_HEADING":
    case "IDENT":
    case "SAY_HEADING":
    case "SAY_ALTITUDE":
    case "EXPECT_APPROACH":
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

function validateAltitude(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "ALTITUDE" }>,
): ValidateResult {
  const ft = instruction.altitudeFt;
  if (!Number.isFinite(ft) || ft % 100 !== 0 || ft < ALTITUDE_MIN_FT || ft > ALTITUDE_MAX_FT) {
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
