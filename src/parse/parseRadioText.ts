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

import type { Instruction, ParseStage, TurnDir } from "@core";
import {
  formatParseError,
  isCallsignToken,
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

const LETTER_NUMBER = /^([HLRCDAS])(\d+)$/;
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

  return {
    ok: true,
    callsignToken,
    instructions: markUntilEstablished(instructions),
    sourceText,
  };
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
    token === "CLR"
  ) {
    return true;
  }
  return LETTER_NUMBER.test(token) || TURN_COMPACT.test(token) || TURN_NUMBER_ONLY.test(token);
}

const ZERO_ARG_INSTRUCTIONS: Readonly<Record<string, Instruction>> = {
  PH: { type: "PRESENT_HEADING" },
  GA: { type: "GO_AROUND" },
  I: { type: "IDENT" },
  SH: { type: "SAY_HEADING" },
  SA: { type: "SAY_ALTITUDE" },
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
  if (!limitId || !isFixIdToken(limitId)) {
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
    if (tokens[i] === "RADAR" && tokens[i + 1] === "VECTORS") {
      access = { type: "RADAR_VECTORS" };
      i += 2;
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
    return finishLetterNumber(compact[1]!, compact[2]!, index + 1);
  }

  if (BARE_LETTER.test(token)) {
    const rawNumber = tokens[index + 1];
    if (rawNumber === undefined || parseUnsignedInt(rawNumber) === null) {
      return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: token };
    }
    return finishLetterNumber(token, rawNumber, index + 2);
  }

  return { ok: false, code: PARSE_ERROR.UNKNOWN_TOKEN, detail: token };
}

function finishLetterNumber(
  letter: string,
  rawNumber: string,
  nextIndex: number,
): InstructionParse {
  const n = parseUnsignedInt(rawNumber);
  if (n === null) {
    return { ok: false, code: PARSE_ERROR.MISSING_NUMBER, detail: letter };
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

  return {
    ok: true,
    instruction: { type: "SPEED", speedKt: n, verb: "MAINTAIN" },
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
