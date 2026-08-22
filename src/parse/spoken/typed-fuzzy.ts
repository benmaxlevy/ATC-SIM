/**
 * Path B: conservative English fragment → phase-1 tokens, then the typed
 * tokenizer. Nonstandard salvage (not 7110.65). Never maps a dangling number
 * to H/D without a verb. Ambiguous rewrite → miss.
 */

import { parseAltitudeFt, parseHeadingDeg, parseSpeedKt, parseTurnDegreesValue } from "./numbers";
import { parseSpokenCallsign } from "./telephony";

interface Cursor {
  tokens: readonly string[];
  i: number;
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

function padHeading(deg: number): string {
  const n = deg === 0 ? 360 : deg;
  return String(n).padStart(3, "0");
}

function flightLevelToken(altitudeFt: number): string | null {
  if (altitudeFt % 100 !== 0) {
    return null;
  }
  return String(altitudeFt / 100);
}

function headingAt(c: Cursor): number | null {
  const parsed = parseHeadingDeg(c.tokens, c.i);
  if (!parsed) {
    return null;
  }
  c.i = parsed.next;
  return parsed.value;
}

/**
 * Rewrite a normalized spoken string to a typed token line (`H270`, `D30`, …).
 * Returns null when the utterance cannot be consumed conservatively.
 */
export function rewriteSpokenToTyped(normalized: string): string | null {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  if (tokens.length === 0) {
    return null;
  }
  const c: Cursor = { tokens, i: 0 };
  const callsign = parseSpokenCallsign(tokens, 0);
  if (callsign.kind === "unknown_telephony") {
    return null;
  }
  const prefix: string[] = [];
  if (callsign.kind === "ok") {
    prefix.push(callsign.callsign);
    c.i = callsign.next;
  }

  const out: string[] = [...prefix];
  while (c.i < tokens.length) {
    if (peek(c) === "and" && peek(c, 1) !== "maintain") {
      c.i += 1;
      continue;
    }
    const token = rewriteOne(c);
    if (token === null) {
      return null;
    }
    out.push(token);
  }

  if (out.length === prefix.length) {
    return null;
  }
  return out.join(" ");
}

function rewriteOne(c: Cursor): string | null {
  return (
    rewriteTurn(c) ??
    rewriteFlyHeading(c) ??
    rewriteBareHeading(c) ??
    rewritePresent(c) ??
    rewriteAltitude(c) ??
    rewriteSpeed(c) ??
    rewriteIdent(c) ??
    rewriteGoAround(c)
  );
}

function rewriteGoAround(c: Cursor): string | null {
  const start = c.i;
  if ((take(c, "go") || take(c, "going")) && take(c, "around")) {
    return "GA";
  }
  c.i = start;
  if (take(c, "go-around")) {
    return "GA";
  }
  c.i = start;
  return null;
}

function rewriteTurn(c: Cursor): string | null {
  const start = c.i;
  if (!take(c, "turn")) {
    return null;
  }
  const left = take(c, "left");
  const right = left ? false : take(c, "right");
  if (!left && !right) {
    c.i = start;
    return null;
  }
  const dir = left ? "L" : "R";
  take(c, "to");
  if (take(c, "heading")) {
    const headingDeg = headingAt(c);
    if (headingDeg === null) {
      c.i = start;
      return null;
    }
    return `${dir}${padHeading(headingDeg)}`;
  }
  const deg = parseTurnDegreesValue(c.tokens, c.i);
  if (deg && c.tokens[deg.next] === "degrees") {
    c.i = deg.next + 1;
    return `T${deg.value}${dir}`;
  }
  c.i = start;
  return null;
}

function rewriteFlyHeading(c: Cursor): string | null {
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
  return `H${padHeading(headingDeg)}`;
}

function rewriteBareHeading(c: Cursor): string | null {
  const start = c.i;
  if (!take(c, "heading")) {
    return null;
  }
  const headingDeg = headingAt(c);
  if (headingDeg === null) {
    c.i = start;
    return null;
  }
  return `H${padHeading(headingDeg)}`;
}

function rewritePresent(c: Cursor): string | null {
  const start = c.i;
  if (take(c, "continue") || take(c, "fly") || take(c, "maintain")) {
    if (take(c, "present") && take(c, "heading")) {
      return "PH";
    }
  }
  if (take(c, "present") && take(c, "heading")) {
    return "PH";
  }
  c.i = start;
  return null;
}

function rewriteAltitude(c: Cursor): string | null {
  const start = c.i;
  let letter: "C" | "D" | "A" | null = null;
  if (take(c, "descend")) {
    letter = "D";
  } else if (take(c, "climb")) {
    letter = "C";
  } else if (take(c, "maintain")) {
    letter = "A";
  } else {
    return null;
  }
  take(c, "to");
  if (peek(c) === "and" && peek(c, 1) === "maintain") {
    c.i += 2;
  }
  take(c, "altitude");
  const alt = parseAltitudeFt(c.tokens, c.i);
  if (!alt) {
    c.i = start;
    return null;
  }
  const fl = flightLevelToken(alt.value);
  if (fl === null) {
    c.i = start;
    return null;
  }
  c.i = alt.next;
  return `${letter}${fl}`;
}

function rewriteSpeed(c: Cursor): string | null {
  const start = c.i;
  if (take(c, "reduce") || take(c, "increase") || take(c, "slow") || take(c, "maintain")) {
    take(c, "speed");
    take(c, "to");
    const spd = parseSpeedKt(c.tokens, c.i);
    if (!spd) {
      c.i = start;
      return null;
    }
    c.i = spd.next;
    if (!take(c, "knots")) {
      c.i = start;
      return null;
    }
    return `S${spd.value}`;
  }
  if (take(c, "speed")) {
    take(c, "to");
    const spd = parseSpeedKt(c.tokens, c.i);
    if (!spd) {
      c.i = start;
      return null;
    }
    c.i = spd.next;
    take(c, "knots");
    return `S${spd.value}`;
  }
  const spd = parseSpeedKt(c.tokens, c.i);
  if (spd && c.tokens[spd.next] === "knots") {
    c.i = spd.next + 1;
    return `S${spd.value}`;
  }
  return null;
}

function rewriteIdent(c: Cursor): string | null {
  const start = c.i;
  if (take(c, "squawk")) {
    if (!take(c, "ident") && !take(c, "iden")) {
      c.i = start;
      return null;
    }
    return "I";
  }
  if (take(c, "ident") || take(c, "iden")) {
    return "I";
  }
  return null;
}
