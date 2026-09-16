/**
 * Deterministic pilot readback templates (training / entertainment only).
 *
 * Analog: FAA JO 7110.65 phraseology (R01) — "descend and maintain",
 * "climb and maintain", three-digit headings ("heading 270").
 * Trainer delta: vice-inspired typed tokens (R08) stay on the command line
 * (`C30`, `H270`); displayed/sent readbacks use numerals and sentence-style
 * capitalization instead of digit-by-digit speech.
 * Not NAS STARS. No TTS; this module only returns strings.
 */

import type { Aircraft, Instruction } from "@core";
import {
  formatAltitude,
  formatCallsignSpeech,
  formatDigitString,
  formatHeadingDigits,
  speakDigitString,
} from "./telephony";

export { formatCallsignSpeech } from "./telephony";

export type ReadbackAircraft = Pick<Aircraft, "headingDeg" | "altitudeFt" | "wakeCategory">;

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
  | "UNKNOWN_TRANSITION"
  | "AMBIGUOUS_TRANSITION"
  | "NOT_ON_COURSE"
  | "UNKNOWN_APPROACH"
  | "NOT_ON_APPROACH"
  | "SQUAWK"
  | "CLEARANCE"
  | "UNABLE_ROUTE"
  | "REQUEST"
  | "RADAR_CONTACT";

const REJECT_FIXED: Record<string, string> = {
  UNKNOWN_CALLSIGN: "Unable, unknown callsign",
  AMBIGUOUS_CALLSIGN: "Unable, ambiguous callsign",
  NO_CALLSIGN_OR_SELECTION: "Unable, no aircraft selected",
  EMPTY: "Unable, say again",
  PARSE: "Unable, say again",
};

const REJECT_AFTER_CALLSIGN: Record<string, string> = {
  HEADING: "unable heading",
  ALTITUDE: "unable altitude",
  SPEED: "unable speed",
  CLIMB_NOT_ABOVE: "unable altitude",
  DESCEND_NOT_BELOW: "unable altitude",
  UNKNOWN_FIX: "unable, unknown fix",
  UNKNOWN_PROCEDURE: "unable, unknown procedure",
  UNKNOWN_TRANSITION: "unable, unknown transition",
  AMBIGUOUS_TRANSITION: "unable, ambiguous transition",
  UNKNOWN_APPROACH: "unable, unknown approach",
  NOT_ON_APPROACH: "unable, not on approach",
  SQUAWK: "unable squawk",
  CLEARANCE: "unable clearance",
  UNABLE_ROUTE: "unable route",
  REQUEST: "unable request",
  RADAR_CONTACT: "unable radar contact",
  CANCELLATION: "unable cancellation",
};

function capitalizeFirst(text: string): string {
  const i = [...text].findIndex((ch) => /[A-Za-z]/.test(ch));
  if (i < 0) {
    return text;
  }
  return text.slice(0, i) + text[i]!.toUpperCase() + text.slice(i + 1);
}

/** ILS27 → `runway 27 localizer`. */
function speakRunwayLocalizer(approachId: string): string {
  const id = approachId.trim().toUpperCase();
  const match = /^[A-Z]+(\d{1,2})([LCR]?)$/.exec(id);
  if (!match) {
    return `${id} localizer`;
  }
  const [, runway, suffix] = match;
  return `runway ${runway}${suffix} localizer`;
}

function speakApproachNav(approachId: string): string {
  const id = approachId.trim().toUpperCase();
  const match = /^([A-Z]+)(\d{1,2})([LCR]?)$/.exec(id);
  if (!match) {
    return id;
  }
  const [, kind, runway, suffix] = match;
  // CIFP uses the compact `I26R` form for an ILS. Read back the published
  // approach type, not the internal one-letter identifier.
  const spokenKind = kind === "I" ? "ILS" : kind;
  return `${spokenKind} runway ${runway}${suffix}`.trim();
}

function formatSpeedClause(instruction: Extract<Instruction, { type: "SPEED" }>): string {
  let clause = `${instruction.verb.toLowerCase()} ${formatDigitString(instruction.speedKt)} knots`;
  if (instruction.until) {
    if (instruction.until.type === "FAF") {
      clause += " until final approach fix";
    } else if (instruction.until.type === "DME") {
      clause += ` until ${formatDigitString(instruction.until.distanceNm)} DME`;
    } else if (instruction.until.type === "FIX") {
      clause += ` until ${instruction.until.fixId}`;
    }
  }
  return clause;
}

function formatAltitudeClause(instruction: Extract<Instruction, { type: "ALTITUDE" }>): string {
  const alt = formatAltitude(instruction.altitudeFt);
  const until = instruction.untilEstablished ? " until established" : "";
  const verbPhrase =
    instruction.verb === "MAINTAIN" ? "maintain" : `${instruction.verb.toLowerCase()} and maintain`;
  return `${verbPhrase} ${alt}${until}`;
}

function formatHeadingClause(instruction: Extract<Instruction, { type: "FLY_HEADING" }>): string {
  const heading = formatHeadingDigits(instruction.headingDeg);
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
      const n = formatDigitString(instruction.degrees);
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
    case "ASSIGN_SQUAWK":
      return instruction.source === "VFR"
        ? "squawk VFR"
        : `squawk ${speakDigitString(instruction.code)}`;
    case "MAINTAIN_VFR":
      return "maintain VFR";
    case "IFR_CLEARANCE": {
      const access = formatIfrClearanceAccess(instruction.access);
      const optional = [
        instruction.altitudeFt === undefined
          ? null
          : `maintain ${formatAltitude(instruction.altitudeFt)}`,
        instruction.climbVia ? "climb via" : null,
        instruction.frequency ? `frequency ${instruction.frequency}` : null,
        instruction.squawk ? `squawk ${speakDigitString(instruction.squawk)}` : null,
      ].filter((value): value is string => value !== null);
      return [`cleared to ${instruction.limitId} ${access}`, ...optional].join(", ");
    }
    case "SAY_HEADING":
      return `heading ${formatHeadingDigits(aircraft.headingDeg)}`;
    case "SAY_ALTITUDE":
      return formatAltitude(aircraft.altitudeFt);
    case "CLEARED_APPROACH":
      return `cleared ${speakApproachNav(instruction.approachId)} approach`;
    case "INTERCEPT_LOCALIZER":
      return `intercept the ${speakRunwayLocalizer(instruction.approachId)}`;
    case "CANCEL_APPROACH":
      return "cancel approach clearance";
    case "EXPECT_APPROACH":
      return `expect ${speakApproachNav(instruction.approachId)}`;
    case "DIRECT":
      return `direct ${instruction.fixId}`;
    case "JOIN_PROCEDURE":
      return `join ${procedureSpeech(instruction.procedureId, procedureNames)}${transitionSpeech(instruction.transitionId)}`;
    case "DESCEND_VIA":
      return `descend via ${procedureSpeech(instruction.procedureId, procedureNames)}${transitionSpeech(instruction.transitionId)}`;
    case "CLIMB_VIA":
      return `climb via ${procedureSpeech(instruction.procedureId, procedureNames)}${transitionSpeech(instruction.transitionId)}`;
    case "CROSS": {
      const alt = formatAltitude(instruction.altitudeFt);
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
    case "DELETE_SPEED_RESTRICTIONS":
      return "delete speed restrictions";
    case "REQUEST_DETAILS":
      return "say request";
    case "STANDBY_REQUEST":
      return "standby";
    case "APPROVE_FLIGHT_FOLLOWING":
      return "flight following approved";
    case "DECLINE_REQUEST":
      return instruction.service === "FLIGHT_FOLLOWING"
        ? "unable flight following"
        : "unable IFR pickup";
    case "RADAR_CONTACT":
      return `radar contact, ${instruction.distanceNm} miles from ${instruction.referenceId}`;
    case "TERMINATE_RADAR_SERVICE":
      return "radar service terminated";
    case "ACKNOWLEDGE_IFR_CANCELLATION":
      return "IFR cancellation received";
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}

function formatIfrClearanceAccess(
  access: Extract<Instruction, { type: "IFR_CLEARANCE" }>["access"],
): string {
  switch (access.type) {
    case "AS_FILED":
      return "as filed";
    case "RADAR_VECTORS":
      return "via radar vectors";
    case "DIRECT":
      return "via direct";
    case "FIX_THEN_DIRECT":
      return `via ${access.fixId} then direct`;
    case "SID":
      return `via ${access.procedureId}${access.transitionId ? ` ${access.transitionId}` : ""}`;
    case "EXPLICIT_ROUTE": {
      if (access.segments.length === 0) return "via direct";
      const parts = access.segments.map((segment) =>
        segment.type === "DIRECT"
          ? `direct ${segment.fixId}`
          : `${segment.procedureId}${segment.transitionId ? ` ${segment.transitionId}` : ""}`,
      );
      return `via ${parts.join(" then ")} then direct`;
    }
    default: {
      const _exhaustive: never = access;
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

function transitionSpeech(transitionId?: string): string {
  if (!transitionId) {
    return "";
  }
  return `, ${transitionId} transition`;
}

/**
 * One callsign at the start, then comma-separated instruction clauses.
 * Combined example: `Delta 123 heading 270, descend and maintain three thousand (3000),
 * maintain 210 knots`.
 */
export function formatReadback(args: {
  callsign: string;
  instructions: Instruction[];
  aircraft: ReadbackAircraft;
  procedureNames?: Readonly<Record<string, string>>;
}): string {
  const callsignSpeech = formatCallsignSpeech(args.callsign, {
    isHeavy: args.aircraft.wakeCategory === "H",
  });
  const clauses = args.instructions.map((instruction) =>
    formatInstructionClause(instruction, args.aircraft, args.procedureNames),
  );
  if (clauses.length === 0) {
    return callsignSpeech;
  }
  const body = clauses.join(", ");
  return capitalizeFirst(callsignSpeech ? `${callsignSpeech} ${body}` : body);
}

/** Error readbacks for rejects. Omit callsign speech when it is unknown. */
export function formatRejectReadback(args: {
  callsign?: string;
  reason: string;
  detail?: string;
  isHeavy?: boolean;
}): string {
  const reason = args.reason.trim().toUpperCase();
  const fixed = REJECT_FIXED[reason];
  if (fixed) {
    return fixed;
  }
  let after = REJECT_AFTER_CALLSIGN[reason] ?? "unable, say again";
  if (reason === "NOT_ON_COURSE") {
    after = args.detail ? `unable, not on course to ${args.detail}` : "unable, not on course";
  } else if ((reason === "SPEED" || reason === "ALTITUDE") && args.detail) {
    after = args.detail;
  }
  const cs = args.callsign ? formatCallsignSpeech(args.callsign, { isHeavy: args.isHeavy }) : "";
  return capitalizeFirst(cs ? `${cs} ${after}` : after);
}
