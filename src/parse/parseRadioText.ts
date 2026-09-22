/**
 * Analog: vice STARS TG typed ATC tokens (R08). Trainer delta: SH/SA parsed.
 * `DCT <FIX>` is DIRECT (D remains descend). `VIA` / `CVIA` / `JOIN` / `X` are T04-04.
 * `EXP ILS27` is EXPECT_APPROACH (T04-05). `IL ILS27` is INTERCEPT_LOCALIZER
 * (loc only, no GS). `GA` is GO_AROUND (T04-07).
 * Same-line heading + altitude + APP sets untilEstablished. Not vice-compatible.
 *
 * Stage 1 only (`parse-pipeline.md`). Does not resolve callsigns, validate ATC
 * limits, or mutate intent. No World, no DOM.
 */

import type { Instruction, ParseStage, SpeedUntil, TurnDir } from "@core";
import {
  formatParseError,
  isCallsignToken,
  isClearanceLimitToken,
  isFixIdToken,
  isProcedureIdToken,
  isTransitionIdToken,
  isTurnDirLetter,
  isSquawkCodeToken,
  PARSE_ERROR,
  parseCrossAltitudeToken,
  parseUnsignedInt,
  type ParseErrorCode,
} from "./tokens";
import { acceptIfrClearanceField, newIfrClearanceFieldOrder } from "./ifr-clearance-syntax";
import {
  scanIfrClearanceRouteWindow,
  type IfrClearanceRouteWindowOptions,
} from "./ifr-clearance-route-window";
import { cancelApproachSequenceError } from "./instruction-order";
import { parseFacilityName } from "./contact";
import {
  EIGHT_POINT_CARDINALS,
  groundAirportPhraseToCatalog,
  groundReferenceToCatalog,
} from "./spoken/catalog-ground";

export type ParseResult =
  | {
      ok: true;
      callsignToken: string | null;
      instructions: Instruction[];
      sourceText: string;
      parseStage?: ParseStage;
      source?: "text" | "voice";
      /** Raw DIRECT/CROSS tokens that unique/margin snap did not ground. T03-18 miss. */
      ungroundedFixes?: string[];
    }
  | { ok: false; error: string; sourceText: string };

const LETTER_NUMBER = /^([HLRCDAS])(\d+)(?:\/(\S*))?$/;
const TURN_COMPACT = /^T(\d+)([LR])$/;
const TURN_NUMBER_ONLY = /^T(\d+)$/;
const TURN_NUMBER_AND_DIR = /^(\d+)([LR])$/;
const BARE_LETTER = /^[HLRCDAS]$/;

export function parseRadioText(
  sourceText: string,
  routeOptions: IfrClearanceRouteWindowOptions = {},
): ParseResult {
  const normalized = sourceText.trim().replace(/\s+/g, " ").toUpperCase();
  if (normalized === "") {
    return fail(sourceText, PARSE_ERROR.EMPTY);
  }

  const tokens = normalized.split(" ");
  let index = 0;
  let callsignToken: string | null = null;

  const first = tokens[0];
  if (first !== undefined && isCallsignToken(first)) {
    callsignToken = first;
    index = 1;
  }

  const instructions: Instruction[] = [];
  while (index < tokens.length) {
    const parsed = parseOneInstruction(tokens, index, routeOptions);
    if (!parsed.ok) {
      return fail(sourceText, parsed.code, parsed.detail);
    }
    instructions.push(parsed.instruction);
    index = parsed.nextIndex;
  }

  if (instructions.some((item) => item.type === "IFR_CLEARANCE") && instructions.length !== 1) {
    return fail(sourceText, PARSE_ERROR.BAD_CLEARANCE, "clearance must be the only instruction");
  }
  if (instructions.some(isRequestControlInstruction) && instructions.length !== 1) {
    return fail(
      sourceText,
      PARSE_ERROR.BAD_CLEARANCE,
      "request instruction must be the only instruction",
    );
  }
  const cancellationError = cancelApproachSequenceError(instructions);
  if (cancellationError !== null) {
    return fail(sourceText, PARSE_ERROR.BAD_CLEARANCE, cancellationError);
  }

  return {
    ok: true,
    callsignToken,
    instructions: markUntilEstablished(instructions),
    sourceText,
  };
}

function isRequestControlInstruction(inst: Instruction): boolean {
  return (
    inst.type === "CLASS_B_CLEARANCE_AS_REQUESTED" ||
    inst.type === "REQUEST_DETAILS" ||
    inst.type === "STANDBY_REQUEST" ||
    inst.type === "APPROVE_FLIGHT_FOLLOWING" ||
    inst.type === "DECLINE_REQUEST" ||
    inst.type === "RADAR_CONTACT" ||
    inst.type === "TERMINATE_RADAR_SERVICE" ||
    inst.type === "ACKNOWLEDGE_IFR_CANCELLATION" ||
    inst.type === "CONTACT_TOWER" ||
    inst.type === "CONTACT_CENTER"
  );
}

function fail(sourceText: string, code: ParseErrorCode, detail?: string): ParseResult {
  return { ok: false, error: formatParseError(code, detail), sourceText };
}

function isTypedInstructionStart(token: string): boolean {
  if (token in ZERO_ARG_INSTRUCTIONS || token in APPROACH_INSTRUCTIONS) {
    return true;
  }
  if (
    token === "DCT" ||
    token === "VIA" ||
    token === "CVIA" ||
    token === "JOIN" ||
    token === "X" ||
    token === "SQ" ||
    token === "MVFR" ||
    token === "CLR" ||
    token === "SAY" ||
    token === "STAND" ||
    token === "STANDBY" ||
    token === "APPROVE" ||
    token === "UNABLE" ||
    token === "RADAR" ||
    token === "IFR" ||
    token === "CONTACT" ||
    token === "VIS"
  ) {
    return true;
  }
  return LETTER_NUMBER.test(token) || TURN_COMPACT.test(token) || TURN_NUMBER_ONLY.test(token);
}

const ZERO_ARG_INSTRUCTIONS: Readonly<Record<string, Instruction>> = {
  PH: { type: "PRESENT_HEADING" },
  GA: { type: "GO_AROUND" },
  CAPP: { type: "CANCEL_APPROACH" },
  I: { type: "IDENT" },
  SH: { type: "SAY_HEADING" },
  SA: { type: "SAY_ALTITUDE" },
  DSR: { type: "DELETE_SPEED_RESTRICTIONS" },
};

const APPROACH_INSTRUCTIONS: Readonly<
  Record<string, "CLEARED_APPROACH" | "INTERCEPT_LOCALIZER" | "EXPECT_APPROACH">
> = {
  APP: "CLEARED_APPROACH",
  IL: "INTERCEPT_LOCALIZER",
  EXP: "EXPECT_APPROACH",
};

type InstructionParse =
  | { ok: true; instruction: Instruction; nextIndex: number }
  | { ok: false; code: ParseErrorCode; detail?: string };

function parseIfrClearance(
  tokens: string[],
  index: number,
  routeOptions: IfrClearanceRouteWindowOptions,
): InstructionParse {
  let i = index + 1;
  if (tokens[i] !== "TO") {
    return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "missing TO" };
  }
  i += 1;
  const limitId = tokens[i];
  if (!limitId || !isClearanceLimitToken(limitId)) {
    return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "missing limit" };
  }
  i += 1;
  let access: Extract<Instruction, { type: "IFR_CLEARANCE" }>["access"] | undefined;
  if (tokens[i] === "ASFILED" || (tokens[i] === "AS" && tokens[i + 1] === "FILED")) {
    access = { type: "AS_FILED" };
    i += tokens[i] === "ASFILED" ? 1 : 2;
  } else {
    if (tokens[i] !== "VIA") {
      return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "missing access" };
    }
    i += 1;
    if (tokens[i] === "RADAR" && (tokens[i + 1] === "VECTORS" || tokens[i + 1] === "VECTOR")) {
      access = { type: "RADAR_VECTORS" };
      i += 2;
      if (tokens[i] === "THEN" && tokens[i + 1] === "DIRECT") {
        i += 2;
      } else if (tokens[i] === "DIRECT") {
        i += 1;
      }
    } else if (
      tokens[i] === "DIRECT" &&
      tokens[i + 1] === "RADAR" &&
      (tokens[i + 2] === "VECTORS" || tokens[i + 2] === "VECTOR")
    ) {
      access = { type: "RADAR_VECTORS" };
      i += 3;
      if (tokens[i] === "THEN" && tokens[i + 1] === "DIRECT") {
        i += 2;
      } else if (tokens[i] === "DIRECT") {
        i += 1;
      }
    } else if (
      tokens[i] === "DIRECT" &&
      tokens[i + 1] === "THEN" &&
      tokens[i + 2] === "RADAR" &&
      (tokens[i + 3] === "VECTORS" || tokens[i + 3] === "VECTOR")
    ) {
      access = { type: "RADAR_VECTORS" };
      i += 4;
      if (tokens[i] === "THEN" && tokens[i + 1] === "DIRECT") {
        i += 2;
      } else if (tokens[i] === "DIRECT") {
        i += 1;
      }
    } else {
      const route = scanIfrClearanceRouteWindow(tokens, i, routeOptions);
      if (!route) {
        return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "bad access" };
      }
      access = { type: "EXPLICIT_ROUTE", segments: route.segments };
      i = route.nextIndex;
    }
  }
  const optional: Pick<
    Extract<Instruction, { type: "IFR_CLEARANCE" }>,
    "altitudeFt" | "climbVia" | "frequency" | "squawk"
  > = {};
  const order = newIfrClearanceFieldOrder();
  while (i < tokens.length) {
    const field = tokens[i];
    if (!field) {
      return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "duplicate or malformed field" };
    }
    const fieldKind = acceptIfrClearanceField(order, field);
    if (!fieldKind) {
      return {
        ok: false,
        code: PARSE_ERROR.BAD_CLEARANCE,
        detail: "duplicate or out-of-order field",
      };
    }
    if (fieldKind === "ALT") {
      const raw = tokens[i + 1];
      const value = raw ? parseUnsignedInt(raw) : null;
      if (value === null || value < 10 || value > 180) {
        return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "bad ALT" };
      }
      optional.altitudeFt = value * 100;
      i += 2;
    } else if (fieldKind === "CVIA") {
      optional.climbVia = true;
      i += 1;
    } else if (fieldKind === "FREQ") {
      const value = tokens[i + 1];
      if (!value || !/^\d{3}(?:\.\d{1,3})?$/.test(value)) {
        return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "bad FREQ" };
      }
      optional.frequency = value;
      i += 2;
    } else if (fieldKind === "SQ") {
      const value = tokens[i + 1];
      if (!value || !isSquawkCodeToken(value)) {
        return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: "bad SQ" };
      }
      optional.squawk = value;
      i += 2;
    } else {
      return { ok: false, code: PARSE_ERROR.BAD_CLEARANCE, detail: field };
    }
  }
  return {
    ok: true,
    instruction: { type: "IFR_CLEARANCE", limitId, access, ...optional },
    nextIndex: i,
  };
}

function parseOneInstruction(
  tokens: string[],
  index: number,
  routeOptions: IfrClearanceRouteWindowOptions,
): InstructionParse {
  const token = tokens[index];
  if (token === undefined) {
    return { ok: false, code: PARSE_ERROR.EMPTY };
  }

  if (token === "CLR") {
    return parseIfrClearance(tokens, index, routeOptions);
  }

  const zeroArg = ZERO_ARG_INSTRUCTIONS[token];
  if (zeroArg) {
    return { ok: true, instruction: zeroArg, nextIndex: index + 1 };
  }

  const approachType = APPROACH_INSTRUCTIONS[token];
  if (approachType) {
    const approachId = tokens[index + 1];
    if (approachId === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_APPROACH_ID };
    }
    return {
      ok: true,
      instruction: { type: approachType, approachId },
      nextIndex: index + 2,
    };
  }
  if (token === "VIS") {
    const rawRwy = tokens[index + 1];
    if (rawRwy === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_APPROACH_ID };
    }
    const runwayId = rawRwy.replace(/^RW/i, "").toUpperCase();
    if (!/^\d{1,2}[LRC]?$/.test(runwayId)) {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: rawRwy };
    }
    return {
      ok: true,
      instruction: { type: "CLEARED_VISUAL", runwayId },
      nextIndex: index + 2,
    };
  }
  if (token === "SQ") {
    const rawCode = tokens[index + 1];
    if (rawCode === "VFR") {
      return {
        ok: true,
        instruction: { type: "ASSIGN_SQUAWK", code: "1200", source: "VFR" },
        nextIndex: index + 2,
      };
    }
    if (!rawCode || !isSquawkCodeToken(rawCode)) {
      return { ok: false, code: PARSE_ERROR.BAD_SQUAWK, detail: rawCode };
    }
    return {
      ok: true,
      instruction: { type: "ASSIGN_SQUAWK", code: rawCode, source: "DISCRETE" },
      nextIndex: index + 2,
    };
  }
  if (token === "MVFR") {
    return {
      ok: true,
      instruction: { type: "MAINTAIN_VFR" },
      nextIndex: index + 1,
    };
  }
  if (token === "SAY" && tokens[index + 1] === "REQUEST") {
    return {
      ok: true,
      instruction: { type: "REQUEST_DETAILS" },
      nextIndex: index + 2,
    };
  }
  if (
    token === "CLEARED" &&
    tokens[index + 1] === "AS" &&
    tokens[index + 2] === "REQUESTED" &&
    tokens[index + 3] === undefined
  ) {
    return {
      ok: true,
      instruction: { type: "CLASS_B_CLEARANCE_AS_REQUESTED" },
      nextIndex: index + 3,
    };
  }
  if (token === "STAND" && tokens[index + 1] === "BY") {
    return {
      ok: true,
      instruction: { type: "STANDBY_REQUEST" },
      nextIndex: index + 2,
    };
  }
  if (token === "STANDBY") {
    return {
      ok: true,
      instruction: { type: "STANDBY_REQUEST" },
      nextIndex: index + 1,
    };
  }
  if (token === "APPROVE") {
    if (tokens[index + 1] === "FLIGHT" && tokens[index + 2] === "FOLLOWING") {
      return {
        ok: true,
        instruction: { type: "APPROVE_FLIGHT_FOLLOWING" },
        nextIndex: index + 3,
      };
    }
    return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
  }
  if (token === "UNABLE") {
    if (tokens[index + 1] === "FLIGHT" && tokens[index + 2] === "FOLLOWING") {
      return {
        ok: true,
        instruction: { type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" },
        nextIndex: index + 3,
      };
    }
    if (
      tokens[index + 1] === "TO" &&
      tokens[index + 2] === "PROVIDE" &&
      tokens[index + 3] === "FLIGHT" &&
      tokens[index + 4] === "FOLLOWING"
    ) {
      return {
        ok: true,
        instruction: { type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" },
        nextIndex: index + 5,
      };
    }
    if (
      tokens[index + 1] === "CLASS" &&
      tokens[index + 2] === "B" &&
      tokens[index + 3] === "CLEARANCE"
    ) {
      return {
        ok: true,
        instruction: { type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" },
        nextIndex: index + 4,
      };
    }
    if (
      tokens[index + 1] === "TO" &&
      tokens[index + 2] === "PROVIDE" &&
      tokens[index + 3] === "CLASS" &&
      tokens[index + 4] === "B" &&
      tokens[index + 5] === "CLEARANCE"
    ) {
      return {
        ok: true,
        instruction: { type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" },
        nextIndex: index + 6,
      };
    }
    if (tokens[index + 1] === "IFR" && tokens[index + 2] === "PICKUP") {
      return {
        ok: true,
        instruction: { type: "DECLINE_REQUEST", service: "IFR_PICKUP" },
        nextIndex: index + 3,
      };
    }
    if (
      tokens[index + 1] === "TO" &&
      tokens[index + 2] === "PROVIDE" &&
      tokens[index + 3] === "IFR" &&
      tokens[index + 4] === "PICKUP"
    ) {
      return {
        ok: true,
        instruction: { type: "DECLINE_REQUEST", service: "IFR_PICKUP" },
        nextIndex: index + 5,
      };
    }
    return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
  }
  if (token === "IFR") {
    if (tokens[index + 1] === "CANCELLATION" && tokens[index + 2] === "RECEIVED") {
      return {
        ok: true,
        instruction: { type: "ACKNOWLEDGE_IFR_CANCELLATION" },
        nextIndex: index + 3,
      };
    }
    return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
  }
  if (token === "RADAR") {
    if (tokens[index + 1] === "SERVICE" && tokens[index + 2] === "TERMINATED") {
      return {
        ok: true,
        instruction: { type: "TERMINATE_RADAR_SERVICE" },
        nextIndex: index + 3,
      };
    }
    if (tokens[index + 1] === "CONTACT") {
      const distToken = tokens[index + 2];
      if (distToken === undefined) {
        return { ok: true, instruction: { type: "RADAR_CONTACT" }, nextIndex: index + 2 };
      }
      const dist = Number(distToken);
      if (!Number.isFinite(dist) || dist <= 0) {
        return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: "distance must be positive" };
      }
      const milesToken = tokens[index + 3];
      if (milesToken !== "MILES" && milesToken !== "MILE") {
        return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: milesToken ?? "" };
      }
      // Optional direction (`25 MILES SOUTHEAST OF KATL`, split `SOUTH EAST`
      // included); the stored reference is position only.
      let refIndex = index + 4;
      const maybeDir = tokens[refIndex]?.toLowerCase();
      if (maybeDir === "north" || maybeDir === "south") {
        refIndex += 1;
        const maybeHalf = tokens[refIndex]?.toLowerCase();
        if (maybeHalf === "east" || maybeHalf === "west") {
          refIndex += 1;
        }
      } else if (maybeDir !== undefined && EIGHT_POINT_CARDINALS.has(maybeDir)) {
        refIndex += 1;
      }
      const fromToken = tokens[refIndex];
      if (fromToken !== "FROM" && fromToken !== "OF") {
        return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: fromToken ?? "" };
      }
      let refEndIndex = refIndex + 1;
      while (
        refEndIndex < tokens.length &&
        !isTypedInstructionStart(tokens[refEndIndex]!) &&
        tokens[refEndIndex] !== "SQUAWK"
      ) {
        refEndIndex += 1;
      }
      const refTokens = tokens.slice(refIndex + 1, refEndIndex);
      if (refTokens.length === 0) {
        return { ok: false, code: PARSE_ERROR.MISSING_FIX_ID, detail: "missing reference" };
      }
      const rawRef = refTokens.join(" ");
      let referenceId = rawRef;
      let referenceKind: "FIX" | "NAVAID" | "AIRPORT" = "FIX";
      const fixCatalog = routeOptions.fixes ?? [];
      const hasFixCatalog = fixCatalog.length > 0;
      let nextIndex = refEndIndex;
      const grounded = hasFixCatalog ? groundReferenceToCatalog(rawRef, fixCatalog) : null;
      const airportHit = groundAirportPhraseToCatalog(rawRef, routeOptions.airports ?? []);
      if (grounded) {
        referenceId = grounded.referenceId;
        referenceKind = grounded.referenceKind;
      } else if (airportHit) {
        referenceId = airportHit.icao;
        referenceKind = "AIRPORT";
        nextIndex = refIndex + 1 + airportHit.length;
      } else {
        let subFound = false;
        if (hasFixCatalog) {
          for (let k = refTokens.length - 1; k >= 1; k -= 1) {
            const subRef = refTokens.slice(0, k).join(" ");
            const subGrounded = groundReferenceToCatalog(subRef, fixCatalog);
            if (subGrounded) {
              referenceId = subGrounded.referenceId;
              referenceKind = subGrounded.referenceKind;
              nextIndex = refIndex + 1 + k;
              subFound = true;
              break;
            }
          }
        }
        if (!subFound && (routeOptions.airports ?? []).length > 0) {
          for (let k = refTokens.length - 1; k >= 1; k -= 1) {
            const subRef = refTokens.slice(0, k).join(" ");
            const subAirport = groundAirportPhraseToCatalog(subRef, routeOptions.airports ?? []);
            if (subAirport) {
              referenceId = subAirport.icao;
              referenceKind = "AIRPORT";
              nextIndex = refIndex + 1 + subAirport.length;
              subFound = true;
              break;
            }
          }
        }
        if (!subFound) {
          if (hasFixCatalog || (routeOptions.airports ?? []).length > 0) {
            return { ok: true, instruction: { type: "RADAR_CONTACT" }, nextIndex: refEndIndex };
          } else {
            const cleanRef = rawRef.trim().replace(/\s+(VOR|VORTAC|TACAN|NDB|DME)$/i, "");
            referenceId = cleanRef.toUpperCase();
            referenceKind =
              rawRef.toUpperCase().includes("VOR") || referenceId.length <= 3 ? "NAVAID" : "FIX";
          }
        }
      }
      return {
        ok: true,
        instruction: {
          type: "RADAR_CONTACT",
          distanceNm: dist,
          referenceId,
          referenceKind,
        },
        nextIndex,
      };
    }
    return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
  }
  if (token === "CONTACT") {
    const terminalIndex = tokens.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && (candidate === "TOWER" || candidate === "CENTER"),
    );
    if (terminalIndex < 0) {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
    }
    const facilityName = parseFacilityName(tokens.slice(index + 1, terminalIndex));
    if (!facilityName) {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: "facility name" };
    }
    return {
      ok: true,
      instruction: {
        type: tokens[terminalIndex] === "TOWER" ? "CONTACT_TOWER" : "CONTACT_CENTER",
        facilityName,
      },
      nextIndex: terminalIndex + 1,
    };
  }
  if (token === "DCT") {
    const fixId = tokens[index + 1];
    if (fixId === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_FIX_ID };
    }
    if (!isFixIdToken(fixId)) {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: fixId };
    }
    return {
      ok: true,
      instruction: { type: "DIRECT", fixId },
      nextIndex: index + 2,
    };
  }
  if (token === "VIA" || token === "CVIA" || token === "JOIN") {
    const procedureId = tokens[index + 1];
    if (procedureId === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_PROCEDURE_ID };
    }
    if (!isProcedureIdToken(procedureId)) {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: procedureId };
    }
    const maybeTrans = tokens[index + 2];
    const takeTransition =
      maybeTrans !== undefined &&
      isTransitionIdToken(maybeTrans) &&
      !isTypedInstructionStart(maybeTrans);
    if (token === "VIA") {
      return {
        ok: true,
        instruction: takeTransition
          ? { type: "DESCEND_VIA", procedureId, transitionId: maybeTrans }
          : { type: "DESCEND_VIA", procedureId },
        nextIndex: takeTransition ? index + 3 : index + 2,
      };
    }
    if (token === "CVIA") {
      return {
        ok: true,
        instruction: takeTransition
          ? { type: "CLIMB_VIA", procedureId, transitionId: maybeTrans }
          : { type: "CLIMB_VIA", procedureId },
        nextIndex: takeTransition ? index + 3 : index + 2,
      };
    }
    return {
      ok: true,
      instruction: takeTransition
        ? { type: "JOIN_PROCEDURE", procedureId, transitionId: maybeTrans }
        : { type: "JOIN_PROCEDURE", procedureId },
      nextIndex: takeTransition ? index + 3 : index + 2,
    };
  }
  if (token === "X") {
    const fixId = tokens[index + 1];
    if (fixId === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_FIX_ID };
    }
    if (!isFixIdToken(fixId)) {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: fixId };
    }
    const altToken = tokens[index + 2];
    if (altToken === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: "X" };
    }
    const parsedAlt = parseCrossAltitudeToken(altToken);
    if (parsedAlt === null) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: altToken };
    }
    return {
      ok: true,
      instruction: {
        type: "CROSS",
        fixId,
        altitudeFt: parsedAlt.altitudeFt,
        restriction: parsedAlt.restriction,
      },
      nextIndex: index + 3,
    };
  }

  const turnCompact = token.match(TURN_COMPACT);
  if (turnCompact) {
    return finishTurn(turnCompact[1]!, turnCompact[2] as "L" | "R", index + 1);
  }

  const turnNumberOnly = token.match(TURN_NUMBER_ONLY);
  if (turnNumberOnly) {
    const dir = tokens[index + 1];
    if (dir === undefined || !isTurnDirLetter(dir)) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: token };
    }
    return finishTurn(turnNumberOnly[1]!, dir, index + 2);
  }

  if (token === "T") {
    const next = tokens[index + 1];
    if (next === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: "T" };
    }
    const glued = next.match(TURN_NUMBER_AND_DIR);
    if (glued) {
      return finishTurn(glued[1]!, glued[2] as "L" | "R", index + 2);
    }
    if (parseUnsignedInt(next) !== null) {
      const dir = tokens[index + 2];
      if (dir === undefined || !isTurnDirLetter(dir)) {
        return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: "T" };
      }
      return finishTurn(next, dir, index + 3);
    }
    return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: "T" };
  }

  const compact = token.match(LETTER_NUMBER);
  if (compact) {
    let nextIdx = index + 1;
    let untilStr = compact[3];
    if (compact[1] === "S" && untilStr === undefined) {
      if (tokens[nextIdx] === "/" && tokens[nextIdx + 1] !== undefined) {
        untilStr = tokens[nextIdx + 1];
        nextIdx += 2;
      } else if (tokens[nextIdx]?.startsWith("/")) {
        untilStr = tokens[nextIdx].slice(1);
        nextIdx += 1;
      }
    }
    return finishLetterNumber(compact[1]!, compact[2]!, nextIdx, untilStr);
  }

  if (BARE_LETTER.test(token)) {
    const rawNumberToken = tokens[index + 1];
    if (rawNumberToken === undefined) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: token };
    }
    const numAndUntil = rawNumberToken.match(/^(\d+)(?:\/(\S*))?$/);
    if (!numAndUntil) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: token };
    }
    let nextIdx = index + 2;
    let untilStr = numAndUntil[2];
    if (token === "S" && untilStr === undefined) {
      if (tokens[nextIdx] === "/" && tokens[nextIdx + 1] !== undefined) {
        untilStr = tokens[nextIdx + 1];
        nextIdx += 2;
      } else if (tokens[nextIdx]?.startsWith("/")) {
        untilStr = tokens[nextIdx].slice(1);
        nextIdx += 1;
      }
    }
    return finishLetterNumber(token, numAndUntil[1]!, nextIdx, untilStr);
  }

  return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
}

function finishLetterNumber(
  letter: string,
  rawNumber: string,
  nextIndex: number,
  rawUntil?: string,
): InstructionParse {
  const n = parseUnsignedInt(rawNumber);
  if (n === null) {
    return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: letter };
  }

  if (rawUntil !== undefined && letter !== "S") {
    return {
      ok: false,
      code: PARSE_ERROR.UNKNOWN_TOKEN,
      detail: `${letter}${rawNumber}/${rawUntil}`,
    };
  }

  if (letter === "H" || letter === "L" || letter === "R") {
    const heading = headingDegFromToken(n);
    if (heading === null) {
      return { ok: false, code: PARSE_ERROR.BAD_HEADING, detail: rawNumber };
    }
    const turn: TurnDir = letter === "H" ? "SHORTEST" : letter === "L" ? "LEFT" : "RIGHT";
    return {
      ok: true,
      instruction: { type: "FLY_HEADING", headingDeg: heading, turn },
      nextIndex,
    };
  }

  if (letter === "C" || letter === "D" || letter === "A") {
    const verb = letter === "C" ? "CLIMB" : letter === "D" ? "DESCEND" : "MAINTAIN";
    return {
      ok: true,
      instruction: { type: "ALTITUDE", altitudeFt: n * 100, verb },
      nextIndex,
    };
  }

  let until: SpeedUntil | undefined;
  if (rawUntil !== undefined) {
    const target = rawUntil.startsWith("/") ? rawUntil.slice(1) : rawUntil;
    if (target === "") {
      return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: "/" };
    }
    if (target === "FAF") {
      until = { type: "FAF" };
    } else {
      const dmeMatch = target.match(/^(\d+)DME$/);
      const numMatch = target.match(/^(\d+)$/);
      if (dmeMatch) {
        const dist = parseUnsignedInt(dmeMatch[1]!);
        if (dist === null) {
          return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: target };
        }
        until = { type: "DME", distanceNm: dist };
      } else if (numMatch) {
        const dist = parseUnsignedInt(numMatch[1]!);
        if (dist === null) {
          return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: target };
        }
        until = { type: "DME", distanceNm: dist };
      } else if (isFixIdToken(target)) {
        until = { type: "FIX", fixId: target };
      } else {
        return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: target };
      }
    }
  }

  return {
    ok: true,
    instruction: {
      type: "SPEED",
      speedKt: n,
      verb: "MAINTAIN",
      ...(until ? { until } : {}),
    },
    nextIndex,
  };
}

function finishTurn(rawDegrees: string, dirLetter: "L" | "R", nextIndex: number): InstructionParse {
  const degrees = parseUnsignedInt(rawDegrees);
  if (degrees === null || degrees < 1 || degrees > 360) {
    return { ok: false, code: PARSE_ERROR.BAD_TURN_DEGREES, detail: rawDegrees };
  }
  return {
    ok: true,
    instruction: {
      type: "TURN_DEGREES",
      direction: dirLetter === "L" ? "LEFT" : "RIGHT",
      degrees,
    },
    nextIndex,
  };
}

/** Headings 0–359 stored as parsed; 360 → 0; 361+ is a parse error. */
function headingDegFromToken(n: number): number | null {
  if (n > 360) {
    return null;
  }
  return n === 360 ? 0 : n;
}

/**
 * Typed `R240 A20 APP ILS27` (or H240) is the 7110.65 ILS vector: heading +
 * maintain until established + cleared approach. Split transmissions do not
 * set the flag — only same-line heading + altitude + APP.
 */
function markUntilEstablished(instructions: Instruction[]): Instruction[] {
  const hasHeading = instructions.some((item) => item.type === "FLY_HEADING");
  const hasAltitude = instructions.some((item) => item.type === "ALTITUDE");
  const hasApp = instructions.some((item) => item.type === "CLEARED_APPROACH");
  if (!hasHeading || !hasAltitude || !hasApp) {
    return instructions;
  }
  return instructions.map((item) =>
    item.type === "ALTITUDE" ? { ...item, untilEstablished: true } : item,
  );
}
