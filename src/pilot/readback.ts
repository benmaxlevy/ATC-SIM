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
  | "UNKNOWN_FIX"
  | "UNKNOWN_PROCEDURE"
  | "NOT_ON_COURSE"
  | "UNKNOWN_APPROACH"
  | "NOT_ON_APPROACH";

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
  UNKNOWN_PROCEDURE: "unable, unknown procedure",
  UNKNOWN_APPROACH: "unable, unknown approach",
  NOT_ON_APPROACH: "unable, not on approach",
};

/** ILS27 → `i l s runway two seven` (English letter names, runway digits). */
function speakApproachNav(approachId: string): string {
  const id = approachId.trim().toUpperCase();
  const match = /^([A-Z]+)(\d{1,2})([LCR]?)$/.exec(id);
  if (!match) {
    return speakAlphanumeric(id);
  }
  const [, kind, runway, suffix] = match;
  const kindSpeech = [...kind].map((ch) => ch.toLowerCase()).join(" ");
  const runwaySpeech = speakDigitString(runway);
  const suffixSpeech = suffix ? suffix.toLowerCase() : "";
  return [kindSpeech, "runway", runwaySpeech, suffixSpeech]
    .filter((part) => part.length > 0)
    .join(" ");
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
  const until = instruction.untilEstablished ? " until established" : "";
  switch (instruction.verb) {
    case "CLIMB":
      return `climb and maintain ${alt}${until}`;
    case "DESCEND":
      return `descend and maintain ${alt}${until}`;
    case "MAINTAIN":
      return `maintain ${alt}${until}`;
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

function formatInstructionClause(
  instruction: Instruction,
  aircraft: ReadbackAircraft,
  procedureNames?: Readonly<Record<string, string>>,
): string {
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
      return `cleared ${speakApproachNav(instruction.approachId)} approach`;
    case "EXPECT_APPROACH":
      return `expect ${speakApproachNav(instruction.approachId)}`;
    case "DIRECT":
      return `direct ${speakAlphanumeric(instruction.fixId)}`;
    case "DESCEND_VIA":
      return `descend via ${procedureSpeech(instruction.procedureId, procedureNames)}`;
    case "CLIMB_VIA":
      return `climb via ${procedureSpeech(instruction.procedureId, procedureNames)}`;
    case "CROSS": {
      const alt = speakAltitude(instruction.altitudeFt);
      const fix = instruction.fixId;
      if (instruction.restriction === "AT_OR_ABOVE") {
        return `cross ${fix} at or above ${alt}`;
      }
      if (instruction.restriction === "AT_OR_BELOW") {
        return `cross ${fix} at or below ${alt}`;
      }
      return `cross ${fix} at ${alt}`;
    }
    case "GO_AROUND":
      return "going around";
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}

function procedureSpeech(
  procedureId: string,
  procedureNames?: Readonly<Record<string, string>>,
): string {
  return procedureNames?.[procedureId] ?? procedureId;
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
  procedureNames?: Readonly<Record<string, string>>;
}): string {
  const callsignSpeech = formatCallsignSpeech(args.callsign);
  const clauses = args.instructions.map((instruction) =>
    formatInstructionClause(instruction, args.aircraft, args.procedureNames),
  );
  if (clauses.length === 0) {
    return callsignSpeech;
  }
  const body = clauses.join(", ");
  return callsignSpeech ? `${callsignSpeech} ${body}` : body;
}

/** Error readbacks for rejects. Omit callsign speech when it is unknown. */
export function formatRejectReadback(args: {
  callsign?: string;
  reason: string;
  detail?: string;
}): string {
  const reason = args.reason.trim().toUpperCase();
  const fixed = REJECT_FIXED[reason];
  if (fixed) {
    return fixed;
  }
  let after = REJECT_AFTER_CALLSIGN[reason] ?? "unable, say again";
  if (reason === "NOT_ON_COURSE") {
    after = args.detail ? `unable, not on course to ${args.detail}` : "unable, not on course";
  }
  const cs = args.callsign ? formatCallsignSpeech(args.callsign) : "";
  return cs ? `${cs} ${after}` : after;
}
