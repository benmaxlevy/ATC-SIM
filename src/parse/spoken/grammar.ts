/**
 * Path A: JO 7110.65-shaped English → Instruction[] (R01 climb/descend and
 * maintain, fly heading, turn left heading). Not ICAO Doc 4444 “climb to” (R10).
 * Does not construct a Command — parseCommand owns the stage list.
 *
 * Bare `heading {ddd}` is Path B salvage, not Path A.
 */

import type { Instruction, TurnDir } from "@core";
import type { ParseResult } from "../parseRadioText";
import { formatParseError, PARSE_ERROR } from "../tokens";
import {
  ONES,
  parseAltitudeFt,
  parseHeadingDeg,
  parseSpeedKt,
  parseTurnDegreesValue,
  singleDigit,
  TEENS,
  TENS,
} from "./numbers";
import {
  groundFixToCatalog,
  groundProcedureToCatalog,
  looksLikeSpokenTransition,
  matchSpokenStarTransition,
  type CatalogProcedure,
} from "./catalog-ground";
import { parseSpokenCallsign, PHONETIC_TO_LETTER, RESERVED_SPOKEN } from "./telephony";

interface Cursor {
  tokens: readonly string[];
  i: number;
  catalog?: readonly string[];
  procedures?: readonly CatalogProcedure[];
}

function peek(c: Cursor, offset = 0): string | undefined {
  return c.tokens[c.i + offset];
}

function take(c: Cursor, word: string): boolean {
  if (peek(c) === word) {
    c.i += 1;
    return true;
  }
  return false;
}

function leftover(c: Cursor): boolean {
  return c.i < c.tokens.length;
}

function headingAt(c: Cursor): number | null {
  const parsed = parseHeadingDeg(c.tokens, c.i);
  if (!parsed) {
    return null;
  }
  c.i = parsed.next;
  return parsed.value;
}

function altitudeAt(c: Cursor): number | null {
  const parsed = parseAltitudeFt(c.tokens, c.i);
  if (!parsed) {
    return null;
  }
  c.i = parsed.next;
  return parsed.value;
}

function speedAt(c: Cursor): number | null {
  const parsed = parseSpeedKt(c.tokens, c.i);
  if (!parsed) {
    return null;
  }
  c.i = parsed.next;
  return parsed.value;
}

function skipToAfterClimbDescend(c: Cursor): void {
  take(c, "to");
  if (peek(c) === "and" && peek(c, 1) === "maintain") {
    c.i += 2;
  }
}

function tryTurnHeading(c: Cursor): Instruction | null {
  const start = c.i;
  if (!take(c, "turn")) {
    return null;
  }
  let turn: TurnDir | null = null;
  if (take(c, "left")) {
    turn = "LEFT";
  } else if (take(c, "right")) {
    turn = "RIGHT";
  }
  // ASR may insert "to" ("turn left to heading 270"); 7110.65 is TURN LEFT HEADING.
  take(c, "to");
  if (turn === null || !take(c, "heading")) {
    c.i = start;
    return null;
  }
  const headingDeg = headingAt(c);
  if (headingDeg === null) {
    c.i = start;
    return null;
  }
  return { type: "FLY_HEADING", headingDeg, turn };
}

function tryTurnDegrees(c: Cursor): Instruction | null {
  const start = c.i;
  if (!take(c, "turn")) {
    return null;
  }
  let direction: "LEFT" | "RIGHT" | null = null;
  if (take(c, "left")) {
    direction = "LEFT";
  } else if (take(c, "right")) {
    direction = "RIGHT";
  }
  if (direction === null) {
    c.i = start;
    return null;
  }
  const deg = parseTurnDegreesValue(c.tokens, c.i);
  if (!deg || c.tokens[deg.next] !== "degrees") {
    c.i = start;
    return null;
  }
  c.i = deg.next + 1;
  return { type: "TURN_DEGREES", direction, degrees: deg.value };
}

function tryFlyHeading(c: Cursor): Instruction | null {
  const start = c.i;
  if (!take(c, "fly") || !take(c, "heading")) {
    c.i = start;
    return null;
  }
  const headingDeg = headingAt(c);
  if (headingDeg === null) {
    c.i = start;
    return null;
  }
  return { type: "FLY_HEADING", headingDeg, turn: "SHORTEST" };
}

function tryPresentHeading(c: Cursor): Instruction | null {
  const start = c.i;
  // R01: FLY PRESENT HEADING / continue present heading. Maintain is a common hearback.
  if (take(c, "continue") || take(c, "fly") || take(c, "maintain")) {
    if (take(c, "present") && take(c, "heading")) {
      return { type: "PRESENT_HEADING" };
    }
  }
  c.i = start;
  return null;
}

function tryAltitude(c: Cursor): Instruction | null {
  const start = c.i;
  let verb: "CLIMB" | "DESCEND" | "MAINTAIN" | null = null;
  if (take(c, "descend")) {
    verb = "DESCEND";
    skipToAfterClimbDescend(c);
  } else if (take(c, "climb")) {
    verb = "CLIMB";
    skipToAfterClimbDescend(c);
  } else if (take(c, "maintain")) {
    verb = "MAINTAIN";
  } else {
    return null;
  }
  const altitudeFt = altitudeAt(c);
  if (altitudeFt === null) {
    c.i = start;
    return null;
  }
  return { type: "ALTITUDE", altitudeFt, verb };
}

function trySpeed(c: Cursor): Instruction | null {
  const start = c.i;
  if (take(c, "maintain")) {
    const speedKt = speedAt(c);
    if (speedKt === null || !take(c, "knots")) {
      c.i = start;
      return null;
    }
    return { type: "SPEED", speedKt, verb: "MAINTAIN" };
  }
  if (take(c, "reduce") || take(c, "slow")) {
    take(c, "speed");
    take(c, "to");
    const speedKt = speedAt(c);
    if (speedKt === null) {
      c.i = start;
      return null;
    }
    take(c, "knots");
    return { type: "SPEED", speedKt, verb: "REDUCE" };
  }
  if (take(c, "increase")) {
    take(c, "speed");
    take(c, "to");
    const speedKt = speedAt(c);
    if (speedKt === null) {
      c.i = start;
      return null;
    }
    take(c, "knots");
    return { type: "SPEED", speedKt, verb: "INCREASE" };
  }
  c.i = start;
  return null;
}

function tryDirect(c: Cursor): Instruction | null {
  const start = c.i;
  take(c, "proceed");
  if (!take(c, "direct")) {
    c.i = start;
    return null;
  }
  take(c, "to");
  const fix = parseFixId(c);
  if (fix === null) {
    c.i = start;
    return null;
  }
  return { type: "DIRECT", fixId: fix };
}

const PROCEDURE_TRAILING = new Set(["arrival", "star", "sid", "procedure"]);

function tryVia(c: Cursor): Instruction | null {
  const start = c.i;
  const climb = take(c, "climb");
  if (!climb) {
    take(c, "descend");
  }
  if (!take(c, "via")) {
    c.i = start;
    return null;
  }
  take(c, "the");
  const procedureId = parseProcedureId(c);
  if (procedureId === null) {
    c.i = start;
    return null;
  }
  if (peek(c) !== undefined && PROCEDURE_TRAILING.has(peek(c)!)) {
    c.i += 1;
  }
  if (climb) {
    const climbVia = attachSpokenStarTransition(c, { type: "CLIMB_VIA", procedureId }, procedureId);
    if (!climbVia) {
      c.i = start;
      return null;
    }
    return climbVia;
  }
  const descend = attachSpokenStarTransition(c, { type: "DESCEND_VIA", procedureId }, procedureId);
  if (!descend) {
    c.i = start;
    return null;
  }
  return descend;
}

function tryJoinProcedure(c: Cursor): Instruction | null {
  const start = c.i;
  if (!take(c, "join")) {
    return null;
  }
  take(c, "the");
  const procedureId = parseProcedureId(c);
  if (procedureId === null) {
    c.i = start;
    return null;
  }
  if (peek(c) !== undefined && PROCEDURE_TRAILING.has(peek(c)!)) {
    c.i += 1;
  }
  const join = attachSpokenStarTransition(c, { type: "JOIN_PROCEDURE", procedureId }, procedureId);
  if (!join) {
    c.i = start;
    return null;
  }
  return join;
}

function attachSpokenStarTransition(
  c: Cursor,
  instruction: Extract<Instruction, { type: "DESCEND_VIA" | "CLIMB_VIA" | "JOIN_PROCEDURE" }>,
  procedureId: string,
): Instruction | null {
  const match = matchSpokenStarTransition(c.tokens, c.i, procedureId, c.procedures ?? []);
  if (match.kind === "hit") {
    c.i = match.next;
    return { ...instruction, transitionId: match.id };
  }
  if (match.kind === "ambiguous") {
    return null;
  }
  if (looksLikeSpokenTransition(c.tokens, c.i)) {
    return null;
  }
  return instruction;
}

function parseProcedureId(c: Cursor): string | null {
  const procedures = c.procedures ?? [];
  if (procedures.length > 0) {
    const remaining = c.tokens.length - c.i;
    for (let n = Math.min(4, remaining); n >= 1; n -= 1) {
      const slice = takeNonReserved(c, n);
      if (slice === null) {
        continue;
      }
      const glued = slice.join(" ");
      const hit = groundProcedureToCatalog(glued, procedures);
      if (hit) {
        c.i += n;
        return hit;
      }
    }
  }
  const tok = peek(c);
  if (tok === undefined || RESERVED_SPOKEN.has(tok)) {
    return null;
  }
  c.i += 1;
  return groundProcedureToCatalog(tok, procedures) ?? tok.toUpperCase();
}

function takeNonReserved(c: Cursor, n: number): string[] | null {
  const slice: string[] = [];
  for (let k = 0; k < n; k += 1) {
    const tok = peek(c, k);
    if (tok === undefined || RESERVED_SPOKEN.has(tok)) {
      return null;
    }
    slice.push(tok);
  }
  return slice;
}

/** Catalog glue may include reserved words (`s join` → SJOIN). No catalog hit → do not consume. */
function takePeek(c: Cursor, n: number): string[] | null {
  const slice: string[] = [];
  for (let k = 0; k < n; k += 1) {
    const tok = peek(c, k);
    if (tok === undefined) {
      return null;
    }
    slice.push(tok);
  }
  return slice;
}

function parseFixId(c: Cursor): string | null {
  const phoneticStart = c.i;
  const phonetics: string[] = [];
  while (phonetics.length < 5) {
    const tok = peek(c);
    if (tok === undefined || !(tok in PHONETIC_TO_LETTER)) {
      break;
    }
    phonetics.push(PHONETIC_TO_LETTER[tok]!);
    c.i += 1;
  }
  const catalog = c.catalog ?? [];
  if (phonetics.length >= 2) {
    const id = phonetics.join("");
    return groundFixToCatalog(id, catalog) ?? id;
  }
  c.i = phoneticStart;

  if (catalog.length > 0) {
    const remaining = c.tokens.length - c.i;
    for (let n = Math.min(3, remaining); n >= 1; n -= 1) {
      const slice = takePeek(c, n);
      if (slice === null) {
        continue;
      }
      const glued = slice.join("");
      const hit = groundFixToCatalog(glued, catalog);
      if (hit) {
        c.i += n;
        return hit;
      }
    }
  }

  const tok = peek(c);
  if (tok === undefined || RESERVED_SPOKEN.has(tok)) {
    return null;
  }
  c.i += 1;
  return groundFixToCatalog(tok, catalog) ?? tok.toUpperCase();
}

function tryGoAround(c: Cursor): Instruction | null {
  const start = c.i;
  if ((take(c, "go") || take(c, "going")) && take(c, "around")) {
    return { type: "GO_AROUND" };
  }
  c.i = start;
  if (take(c, "go-around")) {
    return { type: "GO_AROUND" };
  }
  c.i = start;
  return null;
}

function tryIdent(c: Cursor): Instruction | null {
  const start = c.i;
  if (take(c, "squawk")) {
    if (!take(c, "ident") && !take(c, "iden")) {
      c.i = start;
      return null;
    }
    return { type: "IDENT" };
  }
  if (take(c, "ident") || take(c, "iden")) {
    return { type: "IDENT" };
  }
  return null;
}

function trySay(c: Cursor): Instruction | null {
  const start = c.i;
  if (!take(c, "say")) {
    return null;
  }
  if (take(c, "heading")) {
    return { type: "SAY_HEADING" };
  }
  if (take(c, "altitude")) {
    return { type: "SAY_ALTITUDE" };
  }
  c.i = start;
  return null;
}

function runwayId(c: Cursor): string | null {
  take(c, "runway");
  const d1 = singleDigit(peek(c));
  const d2 = singleDigit(peek(c, 1));
  if (d1 !== null && d2 !== null) {
    c.i += 2;
    const side = runwaySide(peek(c));
    if (side) {
      c.i += 1;
      return `${d1}${d2}${side}`;
    }
    return `${d1}${d2}`;
  }
  const raw = peek(c);
  if (raw !== undefined && /^\d{1,2}[lrc]?$/i.test(raw)) {
    c.i += 1;
    const match = raw.match(/^(\d{1,2})([lrc])?$/i);
    if (!match) {
      return null;
    }
    const num = match[1]!.padStart(2, "0");
    const side = match[2] ? match[2].toUpperCase() : "";
    return `${num}${side}`;
  }
  return null;
}

function runwaySide(tok: string | undefined): string | null {
  if (tok === "left" || tok === "lima") {
    return "L";
  }
  if (tok === "right" || tok === "romeo") {
    return "R";
  }
  if (tok === "center" || tok === "centre" || tok === "charlie") {
    return "C";
  }
  return null;
}

function ilsApproachIdFromRunway(rwy: string): string {
  const numeric = rwy.replace(/[LRC]$/i, "");
  const padded = numeric.padStart(2, "0");
  const side = rwy.slice(numeric.length);
  return `ILS${padded}${side.toUpperCase()}`;
}

function tryCleared(c: Cursor): Instruction | null {
  const start = c.i;
  if ((!take(c, "clear") && !take(c, "cleared")) || !take(c, "ils")) {
    c.i = start;
    return null;
  }
  // 7110.65: "cleared ILS approach runway 27" and "cleared ILS runway 27 approach"
  take(c, "approach");
  const rwy = runwayId(c);
  if (rwy === null) {
    c.i = start;
    return null;
  }
  take(c, "approach");
  return { type: "CLEARED_APPROACH", approachId: ilsApproachIdFromRunway(rwy) };
}

function tryInterceptLocalizer(c: Cursor): Instruction | null {
  const start = c.i;
  if (!take(c, "intercept")) {
    return null;
  }
  take(c, "the");
  const afterThe = c.i;
  const rwyThenLoc = runwayId(c);
  if (rwyThenLoc !== null && take(c, "localizer")) {
    return { type: "INTERCEPT_LOCALIZER", approachId: ilsApproachIdFromRunway(rwyThenLoc) };
  }
  c.i = afterThe;
  if (take(c, "localizer")) {
    const locThenRwy = runwayId(c);
    if (locThenRwy !== null) {
      return { type: "INTERCEPT_LOCALIZER", approachId: ilsApproachIdFromRunway(locThenRwy) };
    }
  }
  c.i = start;
  return null;
}

function takeUntilEstablished(c: Cursor): boolean {
  const start = c.i;
  if (!take(c, "until") || !take(c, "established")) {
    c.i = start;
    return false;
  }
  const locStart = c.i;
  if (take(c, "on") && take(c, "the") && take(c, "localizer")) {
    return true;
  }
  c.i = locStart;
  return true;
}

function takeExpedite(c: Cursor): boolean {
  if (take(c, "expedite")) {
    return true;
  }
  if (peek(c) === "without" && peek(c, 1) === "delay") {
    c.i += 2;
    return true;
  }
  return false;
}

function isDistanceNumber(tok: string | undefined): boolean {
  if (!tok) {
    return false;
  }
  return tok in ONES || tok in TEENS || tok in TENS || /^\d+(\.\d+)?$/.test(tok);
}

export function takePositionAdvisory(c: Cursor): boolean {
  const start = c.i;
  if (peek(c) === "you" && peek(c, 1) === "are") {
    c.i += 2;
  } else if (peek(c) === "you're" || peek(c) === "youre") {
    c.i += 1;
  } else if (peek(c) === "position") {
    c.i += 1;
  } else if (peek(c) === "aircraft" && peek(c, 1) === "is") {
    c.i += 2;
  }

  if (!isDistanceNumber(peek(c))) {
    c.i = start;
    return false;
  }
  do {
    c.i += 1;
  } while (isDistanceNumber(peek(c)));

  if (peek(c) === "nautical" && (peek(c, 1) === "miles" || peek(c, 1) === "mile")) {
    c.i += 2;
  } else if (peek(c) === "miles" || peek(c) === "mile" || peek(c) === "nm") {
    c.i += 1;
  } else {
    c.i = start;
    return false;
  }

  const dir = peek(c);
  if (
    dir === "north" ||
    dir === "south" ||
    dir === "east" ||
    dir === "west" ||
    dir === "northeast" ||
    dir === "northwest" ||
    dir === "southeast" ||
    dir === "southwest"
  ) {
    c.i += 1;
    if (peek(c) === "of") {
      c.i += 1;
    }
  }

  if (peek(c) === "from" || peek(c) === "of" || peek(c) === "outside") {
    c.i += 1;
  }

  take(c, "the");

  if (peek(c) === "airport" || peek(c) === "field") {
    c.i += 1;
    return true;
  }
  if (peek(c) === "outer" && peek(c, 1) === "marker") {
    c.i += 2;
    return true;
  }
  if (peek(c) === "final" && peek(c, 1) === "approach" && peek(c, 2) === "fix") {
    c.i += 3;
    return true;
  }
  if (peek(c) === "marker" || peek(c) === "faf" || peek(c) === "om") {
    c.i += 1;
    return true;
  }
  if (peek(c) === "localizer") {
    c.i += 1;
    return true;
  }
  if (peek(c) === "runway") {
    c.i += 1;
    runwayId(c);
    return true;
  }

  const fix = parseFixId(c);
  if (fix !== null) {
    return true;
  }

  const nextTok = peek(c);
  if (nextTok && !RESERVED_SPOKEN.has(nextTok)) {
    c.i += 1;
    return true;
  }

  return true;
}

function parseOneInstruction(c: Cursor): Instruction | null {
  const start = c.i;
  const expediteBefore = takeExpedite(c);
  const inst =
    tryTurnHeading(c) ??
    tryTurnDegrees(c) ??
    tryFlyHeading(c) ??
    tryPresentHeading(c) ??
    tryAltitude(c) ??
    tryVia(c) ??
    tryJoinProcedure(c) ??
    trySpeed(c) ??
    tryDirect(c) ??
    tryIdent(c) ??
    tryGoAround(c) ??
    trySay(c) ??
    tryInterceptLocalizer(c) ??
    tryCleared(c);
  if (!inst) {
    c.i = start;
    return null;
  }
  if (inst.type === "ALTITUDE") {
    const untilEstablished = takeUntilEstablished(c);
    const expediteAfter = takeExpedite(c);
    const extra: { expedite?: boolean; untilEstablished?: boolean } = {};
    if (expediteBefore || expediteAfter) {
      extra.expedite = true;
    }
    if (untilEstablished) {
      extra.untilEstablished = true;
    }
    if (Object.keys(extra).length === 0) {
      return inst;
    }
    return { ...inst, ...extra };
  }
  if (expediteBefore) {
    c.i = start;
    return null;
  }
  return inst;
}

/**
 * Path A grammar on an already-normalized spoken string.
 * `sourceText` is the pre-normalize original (preserved for the Command).
 */
export function parseSpokenGrammar(
  normalized: string,
  selectedCallsign: string | null | undefined,
  sourceText: string,
  catalogFixes?: readonly string[],
  catalogProcedures?: readonly CatalogProcedure[],
): ParseResult {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  if (tokens.length === 0) {
    return { ok: false, error: formatParseError(PARSE_ERROR.EMPTY), sourceText };
  }

  const c: Cursor = {
    tokens,
    i: 0,
    catalog: catalogFixes ?? [],
    procedures: catalogProcedures ?? [],
  };
  const callsignAttempt = parseSpokenCallsign(tokens, 0);
  if (callsignAttempt.kind === "unknown_telephony") {
    return {
      ok: false,
      error: formatParseError(PARSE_ERROR.UNKNOWN_TELEPHONY, callsignAttempt.word),
      sourceText,
    };
  }
  let callsignToken: string | null = null;
  if (callsignAttempt.kind === "ok") {
    callsignToken = callsignAttempt.callsign;
    c.i = callsignAttempt.next;
  } else {
    callsignToken = selectedCallsign ?? null;
  }

  const instructions: Instruction[] = [];
  while (leftover(c)) {
    if ((peek(c) === "and" && peek(c, 1) !== "maintain") || peek(c) === "then") {
      c.i += 1;
      continue;
    }
    if (takePositionAdvisory(c)) {
      continue;
    }
    const inst = parseOneInstruction(c);
    if (!inst) {
      return { ok: false, error: formatParseError(PARSE_ERROR.PARSE_MISS), sourceText };
    }
    instructions.push(inst);
  }

  if (instructions.length === 0) {
    return { ok: false, error: formatParseError(PARSE_ERROR.PARSE_MISS), sourceText };
  }

  return { ok: true, callsignToken, instructions, sourceText };
}

/**
 * JO 7110.65 (R01): TURN LEFT/RIGHT HEADING (degrees) is a vector (`FLY_HEADING`),
 * not a relative `TURN_DEGREES`. Path C 1.5B models mix these when ASR writes `270`.
 */
export function repairHeadingVsTurnDegrees(
  normalized: string,
  instructions: Instruction[],
): Instruction[] {
  const tokens = new Set(normalized.split(" ").filter((tok) => tok.length > 0));
  if (!tokens.has("heading") || tokens.has("degrees")) {
    return instructions;
  }
  return instructions.map((inst) => {
    if (inst.type !== "TURN_DEGREES") {
      return inst;
    }
    const headingDeg = inst.degrees === 360 ? 0 : inst.degrees;
    if (headingDeg < 0 || headingDeg >= 360) {
      return inst;
    }
    return { type: "FLY_HEADING", headingDeg, turn: inst.direction };
  });
}
