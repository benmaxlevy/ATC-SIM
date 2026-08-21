/**
 * Airline telephony → ICAO (data, not a 200-airline switch).
 * Unknown carrier + flight number is `unknown_telephony`, never a guessed prefix.
 */

import telephonyTable from "./telephony.json";
import { FULL_CALLSIGN, SUFFIX_CALLSIGN } from "../tokens";
import { singleDigit } from "./numbers";

export const PHONETIC_TO_LETTER: Readonly<Record<string, string>> = {
  alfa: "A",
  alpha: "A",
  bravo: "B",
  charlie: "C",
  delta: "D",
  echo: "E",
  foxtrot: "F",
  golf: "G",
  hotel: "H",
  india: "I",
  juliett: "J",
  juliet: "J",
  kilo: "K",
  lima: "L",
  mike: "M",
  november: "N",
  oscar: "O",
  papa: "P",
  quebec: "Q",
  romeo: "R",
  sierra: "S",
  tango: "T",
  uniform: "U",
  victor: "V",
  whiskey: "W",
  "x-ray": "X",
  xray: "X",
  yankee: "Y",
  zulu: "Z",
};

/** Words that start an instruction or number slot — never treated as unknown telephony. */
export const RESERVED_SPOKEN: ReadonlySet<string> = new Set([
  "turn",
  "fly",
  "continue",
  "descend",
  "climb",
  "maintain",
  "reduce",
  "slow",
  "increase",
  "proceed",
  "direct",
  "ident",
  "squawk",
  "say",
  "cleared",
  "expedite",
  "heading",
  "present",
  "left",
  "right",
  "degrees",
  "knots",
  "speed",
  "ils",
  "runway",
  "approach",
  "and",
  "to",
  "the",
  "your",
  "altitude",
  "thousand",
  "hundred",
  "feet",
]);

const TABLE = telephonyTable as Record<string, string>;

const TELEPHONY_ENTRIES = Object.entries(TABLE).sort(
  (a, b) => b[0].split(" ").length - a[0].split(" ").length,
);

export type CallsignAttempt =
  | { kind: "none" }
  | { kind: "ok"; callsign: string; next: number }
  | { kind: "unknown_telephony"; word: string };

function phoneticLetter(tok: string | undefined): string | null {
  if (tok === undefined) {
    return null;
  }
  if (tok in PHONETIC_TO_LETTER) {
    return PHONETIC_TO_LETTER[tok]!;
  }
  if (/^[a-z]$/.test(tok)) {
    return tok.toUpperCase();
  }
  return null;
}

function parseFlightNumber(
  tokens: readonly string[],
  i: number,
): { value: string; next: number } | null {
  let j = i;
  const digits: number[] = [];
  while (digits.length < 4) {
    const d = singleDigit(tokens[j]);
    if (d === null) {
      break;
    }
    digits.push(d);
    j += 1;
  }
  if (digits.length === 0) {
    return null;
  }
  const letter = phoneticLetter(tokens[j]);
  const suffix = letter !== null ? letter : "";
  if (letter !== null) {
    j += 1;
  }
  return { value: `${digits.join("")}${suffix}`, next: j };
}

function matchTelephony(
  tokens: readonly string[],
  i: number,
): { icao: string; next: number } | null {
  for (const [spoken, icao] of TELEPHONY_ENTRIES) {
    const words = spoken.split(" ");
    const slice = tokens.slice(i, i + words.length).join(" ");
    if (slice === spoken) {
      return { icao, next: i + words.length };
    }
  }
  return null;
}

function parseSpokenIcao(
  tokens: readonly string[],
  i: number,
): { callsign: string; next: number } | null {
  const a = phoneticLetter(tokens[i]);
  const b = phoneticLetter(tokens[i + 1]);
  const c = phoneticLetter(tokens[i + 2]);
  if (a === null || b === null || c === null) {
    return null;
  }
  const flight = parseFlightNumber(tokens, i + 3);
  if (flight === null) {
    return null;
  }
  return { callsign: `${a}${b}${c}${flight.value}`, next: flight.next };
}

function parseNovemberTail(
  tokens: readonly string[],
  i: number,
): { callsign: string; next: number } | null {
  if (tokens[i] !== "november") {
    return null;
  }
  let j = i + 1;
  const chars: string[] = [];
  while (j < tokens.length && chars.length < 6) {
    const d = singleDigit(tokens[j]);
    if (d !== null) {
      chars.push(String(d));
      j += 1;
      continue;
    }
    const letter = phoneticLetter(tokens[j]);
    if (letter !== null && letter !== "N") {
      chars.push(letter);
      j += 1;
      continue;
    }
    break;
  }
  if (chars.length === 0) {
    return null;
  }
  return { callsign: `N${chars.join("")}`, next: j };
}

/**
 * Optional callsign at the start of a spoken utterance.
 * Telephony requires a digit-by-digit flight number (`one two three` → `123`).
 */
export function parseSpokenCallsign(tokens: readonly string[], i: number): CallsignAttempt {
  const first = tokens[i];
  if (first === undefined || RESERVED_SPOKEN.has(first)) {
    return { kind: "none" };
  }

  const compact = first.toUpperCase();
  if (FULL_CALLSIGN.test(compact) || SUFFIX_CALLSIGN.test(compact)) {
    return { kind: "ok", callsign: compact, next: i + 1 };
  }

  const november = parseNovemberTail(tokens, i);
  if (november) {
    return { kind: "ok", callsign: november.callsign, next: november.next };
  }

  const tel = matchTelephony(tokens, i);
  if (tel) {
    const flight = parseFlightNumber(tokens, tel.next);
    if (flight) {
      return { kind: "ok", callsign: `${tel.icao}${flight.value}`, next: flight.next };
    }
  }

  const icao = parseSpokenIcao(tokens, i);
  if (icao) {
    return { kind: "ok", callsign: icao.callsign, next: icao.next };
  }

  const flightAfter = parseFlightNumber(tokens, i + 1);
  if (flightAfter && !RESERVED_SPOKEN.has(first) && !(first in PHONETIC_TO_LETTER)) {
    return { kind: "unknown_telephony", word: first };
  }

  return { kind: "none" };
}
