/**
 * Deterministic pilot readback templates (training / entertainment only).
 *
 * Analog: FAA JO 7110.65 phraseology (R01) — "descend and maintain",
 * "climb and maintain", digit-by-digit headings ("heading two seven zero").
 * Trainer delta: vice-inspired typed tokens (R08) stay on the command line
 * (`C30`, `H270`); spoken readbacks are 7110.65, not "climb three zero".
 * Not NAS STARS. No TTS; this module only returns strings.
 */

import type { Aircraft, Instruction } from "@core";
import { speakAltitude, speakDigitString, speakHeading } from "./digits";
import { formatCallsignSpeech, speakAlphanumeric } from "./telephony";

export { formatCallsignSpeech } from "./telephony";

export type ReadbackAircraft = Pick<Aircraft, "headingDeg" | "altitudeFt">;

export type RejectReason =
  | "UNKNOWN_CALLSIGN"
  | "AMBIGUOUS_CALLSIGN"
  | "NO_CALLSIGN_OR_SELECTION"
  | "HEADING"
  | "ALTITUDE"
  | "SPEED"
  | "EMPTY"
  | "CLIMB_NOT_ABOVE"
  | "DESCEND_NOT_BELOW"
  | "PARSE"
  | "UNKNOWN_FIX";

const REJECT_FIXED: Record<string, string> = {
  UNKNOWN_CALLSIGN: "unable, unknown callsign",
  AMBIGUOUS_CALLSIGN: "unable, ambiguous callsign",
  NO_CALLSIGN_OR_SELECTION: "unable, no aircraft selected",
  EMPTY: "unable, say again",
  PARSE: "unable, say again",
};

const REJECT_AFTER_CALLSIGN: Record<string, string> = {
  HEADING: "unable heading",
  ALTITUDE: "unable altitude",
  SPEED: "unable speed",
  CLIMB_NOT_ABOVE: "unable altitude",
  DESCEND_NOT_BELOW: "unable altitude",
  UNKNOWN_FIX: "unable, unknown fix",
};

/** ILS27 → `i l s two seven` (English letter names, runway digits). */
function speakApproachBody(approachId: string): string {
  const id = approachId.trim().toUpperCase();
  const match = /^([A-Z]+)(\d{1,2})([LCR]?)$/.exec(id);
  if (!match) {
    return speakAlphanumeric(id);
  }
  const [, kind, runway, suffix] = match;
  const kindSpeech = [...kind].map((ch) => ch.toLowerCase()).join(" ");
  const runwaySpeech = speakDigitString(runway);
  const suffixSpeech = suffix ? suffix.toLowerCase() : "";
  return [kindSpeech, runwaySpeech, suffixSpeech].filter((part) => part.length > 0).join(" ");
}

function formatSpeedClause(instruction: Extract<Instruction, { type: "SPEED" }>): string {
  const knots = `${speakDigitString(instruction.speedKt)} knots`;
  switch (instruction.verb) {
    case "MAINTAIN":
      return `maintain ${knots}`;
    case "INCREASE":
      return `increase ${knots}`;
    case "REDUCE":
      return `reduce ${knots}`;
    default: {
      const _exhaustive: never = instruction.verb;
      return _exhaustive;
    }
  }
}

function formatAltitudeClause(instruction: Extract<Instruction, { type: "ALTITUDE" }>): string {
  const alt = speakAltitude(instruction.altitudeFt);
  switch (instruction.verb) {
    case "CLIMB":
      return `climb and maintain ${alt}`;
    case "DESCEND":
      return `descend and maintain ${alt}`;
    case "MAINTAIN":
      return `maintain ${alt}`;
    default: {
      const _exhaustive: never = instruction.verb;
      return _exhaustive;
    }
  }
}

function formatHeadingClause(instruction: Extract<Instruction, { type: "FLY_HEADING" }>): string {
  const heading = speakHeading(instruction.headingDeg);
  switch (instruction.turn) {
    case "LEFT":
      return `turn left heading ${heading}`;
    case "RIGHT":
      return `turn right heading ${heading}`;
    case "SHORTEST":
      return `heading ${heading}`;
    default: {
      const _exhaustive: never = instruction.turn;
      return _exhaustive;
    }
  }
}

function formatInstructionClause(instruction: Instruction, aircraft: ReadbackAircraft): string {
  switch (instruction.type) {
    case "FLY_HEADING":
      return formatHeadingClause(instruction);
    case "TURN_DEGREES": {
      const n = speakDigitString(instruction.degrees);
      const dir = instruction.direction === "LEFT" ? "left" : "right";
      return `turn ${dir} ${n} degrees`;
    }
    case "PRESENT_HEADING":
      return "fly present heading";
    case "ALTITUDE":
      return formatAltitudeClause(instruction);
    case "SPEED":
      return formatSpeedClause(instruction);
    case "IDENT":
      return "ident";
    case "SAY_HEADING":
      return `heading ${speakHeading(aircraft.headingDeg)}`;
    case "SAY_ALTITUDE":
      return speakAltitude(aircraft.altitudeFt);
    case "CLEARED_APPROACH":
      return `cleared ${speakApproachBody(instruction.approachId)} approach`;
    case "EXPECT_APPROACH":
      return `expect ${speakApproachBody(instruction.approachId)} approach`;
    case "DIRECT":
      return `direct ${speakAlphanumeric(instruction.fixId)}`;
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}

/**
 * One callsign at the start, then comma-separated instruction clauses.
 * Combined example: `delta one two three heading two seven zero, descend and
 * maintain three thousand, maintain two one zero knots`.
 */
export function formatReadback(args: {
  callsign: string;
  instructions: Instruction[];
  aircraft: ReadbackAircraft;
}): string {
  const callsignSpeech = formatCallsignSpeech(args.callsign);
  const clauses = args.instructions.map((instruction) =>
    formatInstructionClause(instruction, args.aircraft),
  );
  if (clauses.length === 0) {
    return callsignSpeech;
  }
  const body = clauses.join(", ");
  return callsignSpeech ? `${callsignSpeech} ${body}` : body;
}

/** Error readbacks for rejects. Omit callsign speech when it is unknown. */
export function formatRejectReadback(args: { callsign?: string; reason: string }): string {
  const reason = args.reason.trim().toUpperCase();
  const fixed = REJECT_FIXED[reason];
  if (fixed) {
    return fixed;
  }
  const after = REJECT_AFTER_CALLSIGN[reason] ?? "unable, say again";
  const cs = args.callsign ? formatCallsignSpeech(args.callsign) : "";
  return cs ? `${cs} ${after}` : after;
}
