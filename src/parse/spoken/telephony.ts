/**
 * Airline telephony → ICAO (data, not a 200-airline switch).
 * Unknown carrier + flight number is `unknown_telephony`, never a guessed prefix.
 */

import telephonyTable from "./telephony.json";
import { FULL_CALLSIGN, GA_CALLSIGN, SUFFIX_CALLSIGN } from "../tokens";
import { singleDigit, TEENS, TENS } from "./numbers";

export const PHONETIC_TO_LETTER: Readonly<Record<string, string>> = {
  alfa: "A",
  alpha: "A",
  bravo: "B",
  charlie: "C",
  delta: "D",
  echo: "E",
  foxtrot: "F",
  golf: "G",
  gulf: "G",
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
  whisky: "W",
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
  "join",
  "then",
  "via",
  "ident",
  "squawk",
  "say",
  "cleared",
  "clear",
  "intercept",
  "expedite",
  "iden",
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
  "until",
  "established",
  "localizer",
  "and",
  "to",
  "the",
  "on",
  "go",
  "going",
  "around",
  "your",
  "altitude",
  "thousand",
  "hundred",
  "feet",
  "miles",
  "mile",
  "airport",
  "transition",
  "stand",
  "standby",
  "approve",
  "unable",
  "radar",
  "following",
]);

const TABLE = { ...telephonyTable, giant: "GTI" } as Record<string, string>;

const TELEPHONY_ENTRIES = Object.entries(TABLE).sort(
  (a, b) => b[0].split(" ").length - a[0].split(" ").length,
);

export type CallsignAttempt =
  | { kind: "none" }
  | { kind: "ok"; callsign: string; next: number; alias?: boolean }
  | { kind: "invalid_alias" }
  | { kind: "unknown_telephony"; word: string };

/** Canonical live identity plus authored spoken names. Aliases never leave the parser. */
export interface CallsignCandidate {
  callsign: string;
  aliases?: readonly string[];
}

export type CallsignRosterEntry = string | CallsignCandidate;

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

function compactFlightNumber(tok: string | undefined): { value: string; letter: string } | null {
  if (tok === undefined) {
    return null;
  }
  const match = tok.match(/^(\d{1,4})([a-z])?$/i);
  if (!match) {
    return null;
  }
  return { value: match[1]!, letter: match[2] ? match[2].toUpperCase() : "" };
}

function parseFlightNumber(
  tokens: readonly string[],
  i: number,
): { value: string; next: number } | null {
  const singleCompact = compactFlightNumber(tokens[i]);
  if (singleCompact !== null && singleCompact.value.length >= 3) {
    let j = i + 1;
    let suffix = singleCompact.letter;
    if (suffix === "") {
      const letter = phoneticLetter(tokens[j]);
      if (letter !== null) {
        suffix = letter;
        j += 1;
      }
    }
    return { value: `${singleCompact.value}${suffix}`, next: j };
  }

  let j = i;
  let digits = "";

  while (j < tokens.length && digits.length < 4) {
    const tok = tokens[j];
    if (tok === undefined || RESERVED_SPOKEN.has(tok)) {
      break;
    }

    if (
      digits.length > 0 &&
      (tokens[j + 1] === "miles" ||
        tokens[j + 1] === "mile" ||
        tokens[j + 1] === "nautical" ||
        tokens[j + 1] === "nm" ||
        tokens[j + 1] === "knots" ||
        tokens[j + 1] === "degrees" ||
        tokens[j + 1] === "thousand" ||
        tokens[j + 1] === "feet")
    ) {
      break;
    }

    const d = singleDigit(tok);
    if (d !== null && d > 0 && tokens[j + 1] === "hundred" && digits.length === 0) {
      const base = d * 100;
      j += 2;
      let rest = 0;
      if (tokens[j] === "and") {
        j += 1;
      }
      const nextTok = tokens[j];
      if (nextTok && nextTok in TEENS) {
        rest = TEENS[nextTok]!;
        j += 1;
      } else if (nextTok && nextTok in TENS) {
        rest = TENS[nextTok]!;
        j += 1;
        const ones = singleDigit(tokens[j]);
        if (ones !== null && ones > 0) {
          rest += ones;
          j += 1;
        }
      } else {
        const ones = singleDigit(nextTok);
        if (ones !== null && ones > 0) {
          rest = ones;
          j += 1;
        }
      }
      digits = String(base + rest);
      break;
    }

    if (d !== null) {
      digits += String(d);
      j += 1;
      continue;
    }

    if (tok in TEENS) {
      digits += String(TEENS[tok]);
      j += 1;
      continue;
    }

    if (tok in TENS) {
      let val = TENS[tok]!;
      j += 1;
      const ones = singleDigit(tokens[j]);
      if (ones !== null && ones > 0) {
        val += ones;
        j += 1;
      }
      digits += String(val);
      continue;
    }

    if (/^\d{1,4}$/.test(tok)) {
      if (digits.length + tok.length <= 4) {
        digits += tok;
        j += 1;
        continue;
      }
    }

    const compact = compactFlightNumber(tok);
    if (compact !== null && digits.length === 0) {
      digits = compact.value;
      j += 1;
      if (compact.letter) {
        return { value: `${digits}${compact.letter}`, next: j };
      }
      continue;
    }

    break;
  }

  if (digits.length === 0 || digits.length > 4) {
    return null;
  }

  const letter = phoneticLetter(tokens[j]);
  const suffix = letter !== null ? letter : "";
  if (letter !== null) {
    j += 1;
  }

  return { value: `${digits}${suffix}`, next: j };
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

/**
 * ASR often glues the carrier onto the flight number (`American201`).
 * Do not split in the normalizer — typed tokens like `H270` must stay intact.
 */
function matchGluedTelephony(tok: string | undefined): { icao: string; flight: string } | null {
  if (!tok) {
    return null;
  }
  const lower = tok.toLowerCase();
  let best: { icao: string; flight: string; nameLen: number } | null = null;
  for (const [spoken, icao] of TELEPHONY_ENTRIES) {
    const name = spoken.replace(/ /g, "");
    if (name.length < 2 || !lower.startsWith(name)) {
      continue;
    }
    const rest = lower.slice(name.length);
    const compact = compactFlightNumber(rest);
    if (!compact) {
      continue;
    }
    const reconstructed = `${compact.value}${compact.letter}`.toLowerCase();
    if (rest !== reconstructed) {
      continue;
    }
    if (!best || name.length > best.nameLen) {
      best = { icao, flight: `${compact.value}${compact.letter}`, nameLen: name.length };
    }
  }
  return best ? { icao: best.icao, flight: best.flight } : null;
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
  let digits = 0;
  while (j < tokens.length && chars.length < 7) {
    const d = singleDigit(tokens[j]);
    if (d !== null) {
      if (digits >= 5) {
        break;
      }
      digits += 1;
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

function normalizedAliasWords(alias: string): string[] {
  return alias.trim().toLowerCase().replace(/\s+/g, " ").split(" ").filter(Boolean);
}

function canonicalTail(callsign: string): string | null {
  const match = callsign
    .trim()
    .toUpperCase()
    .match(/^N(\d{1,5}[A-Z]{0,2})$/);
  return match?.[1] ?? null;
}

function parseAliasTail(
  tokens: readonly string[],
  i: number,
): { tail: string; next: number } | null {
  const compact = tokens[i]?.match(/^(\d{1,5})([a-z]{0,2})$/i);
  if (compact) {
    return { tail: `${compact[1]}${compact[2]}`.toUpperCase(), next: i + 1 };
  }

  let j = i;
  let digits = "";
  while (j < tokens.length && digits.length < 5) {
    const digit = singleDigit(tokens[j]);
    if (digit === null) break;
    digits += String(digit);
    j += 1;
  }
  if (digits.length === 0) return null;

  let letters = "";
  while (j < tokens.length && letters.length < 2) {
    const letter = phoneticLetter(tokens[j]);
    if (letter === null || letter === "N") break;
    letters += letter;
    j += 1;
  }
  return { tail: `${digits}${letters}`, next: j };
}

export const GA_ALIAS_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  cirrus: [
    "cirrus",
    "sirius",
    "serious",
    "cyrus",
    "sir",
    "sirs",
    "service",
    "cirus",
    "cirru",
    "siriu",
  ],
  cirru: [
    "cirrus",
    "sirius",
    "serious",
    "cyrus",
    "sir",
    "sirs",
    "service",
    "cirus",
    "cirru",
    "siriu",
  ],
  siriu: [
    "cirrus",
    "sirius",
    "serious",
    "cyrus",
    "sir",
    "sirs",
    "service",
    "cirus",
    "cirru",
    "siriu",
  ],
  sirius: [
    "cirrus",
    "sirius",
    "serious",
    "cyrus",
    "sir",
    "sirs",
    "service",
    "cirus",
    "cirru",
    "siriu",
  ],
  skyhawk: ["skyhawk", "sky hawk", "sky"],
  skylane: ["skylane", "sky lane"],
  bonanza: ["bonanza", "banana", "bonansa"],
  caravan: ["caravan", "carevan", "car van"],
  archer: ["archer", "arch"],
  diamond: ["diamond", "dimon", "diomand"],
  cessna: ["cessna", "sesna"],
  piper: ["piper", "pipe"],
  beechcraft: ["beechcraft", "beech craft", "beech"],
  mooney: ["mooney", "money", "muni"],
};

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, idx) => idx);
  let curr = new Array(b.length + 1).fill(0);

  for (let idx = 0; idx < a.length; idx++) {
    curr[0] = idx + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a.charCodeAt(idx) === b.charCodeAt(j) ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[b.length]!;
}

function wordMatchesFuzzy(spoken: string, target: string): boolean {
  if (spoken === target) return true;
  if (
    RESERVED_SPOKEN.has(spoken) ||
    singleDigit(spoken) !== null ||
    spoken in TEENS ||
    spoken in TENS ||
    /^\d+$/.test(spoken)
  ) {
    return false;
  }
  // Guard against short words causing spurious collisions (e.g. "sky", "sir")
  if (target.length < 4 || spoken.length < 3) return false;
  const maxDistance = target.length >= 6 ? 2 : 1;
  return levenshteinDistance(spoken, target) <= maxDistance;
}

function aliasCallsignAt(
  tokens: readonly string[],
  i: number,
  roster: readonly CallsignRosterEntry[],
): { kind: "none" | "invalid" | "ambiguous" | "ok"; callsign?: string; next?: number } {
  const candidates = roster.flatMap((entry) => {
    const callsign = typeof entry === "string" ? entry : entry.callsign;
    const aliases = typeof entry === "string" ? [] : (entry.aliases ?? []);
    return aliases.map((alias) => ({ callsign: callsign.trim().toUpperCase(), alias }));
  });
  let aliasPrefix = false;
  const aliasOwners = new Set<string>();
  const matches: Array<{ callsign: string; next: number; score: number }> = [];

  const gluedMatch = tokens[i]?.match(/^([a-z]+)(\d{1,5}[a-z]{0,2})$/i);

  for (const candidate of candidates) {
    const primary = candidate.alias.trim().toLowerCase();
    const variants = [candidate.alias, ...(GA_ALIAS_VARIANTS[primary] ?? [])];
    // Sort variants by word length descending so multi-word variants match first
    const variantWordLists = variants
      .map((v) => normalizedAliasWords(v))
      .filter((w) => w.length > 0)
      .sort((a, b) => b.length - a.length);

    let matchedWordsLen = 0;
    let isExact = false;
    for (const words of variantWordLists) {
      if (tokens.slice(i, i + words.length).join(" ") === words.join(" ")) {
        matchedWordsLen = words.length;
        isExact = true;
        break;
      }
    }
    if (matchedWordsLen === 0) {
      for (const words of variantWordLists) {
        if (i + words.length <= tokens.length) {
          let allMatch = true;
          for (let k = 0; k < words.length; k++) {
            if (!wordMatchesFuzzy(tokens[i + k]!, words[k]!)) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            matchedWordsLen = words.length;
            isExact = false;
            break;
          }
        }
      }
    }

    if (matchedWordsLen > 0) {
      aliasPrefix = true;
      aliasOwners.add(candidate.callsign);
      const tail = parseAliasTail(tokens, i + matchedWordsLen);
      const expected = canonicalTail(candidate.callsign);
      if (tail && expected !== null) {
        const baseScore = isExact ? 2 : 1;
        if (tail.tail === expected) {
          matches.push({ callsign: candidate.callsign, next: tail.next, score: baseScore + 2 });
        } else {
          const expectedDigits = expected.replace(/\D/g, "");
          const expectedSuffix = expected.replace(/\d/g, "");
          const tailDigits = tail.tail.replace(/\D/g, "");
          const tailSuffix = tail.tail.replace(/\d/g, "");
          if (
            tailDigits.length > 0 &&
            tailDigits === expectedDigits &&
            (tailSuffix === "" || tailSuffix === expectedSuffix)
          ) {
            matches.push({ callsign: candidate.callsign, next: tail.next, score: baseScore });
          }
        }
      }
    } else if (gluedMatch) {
      const prefix = gluedMatch[1]!.toLowerCase();
      const tailStr = gluedMatch[2]!.toUpperCase();
      let gluedPrefixMatch = false;
      let gluedExact = false;
      for (const words of variantWordLists) {
        if (words.length === 1) {
          if (prefix === words[0]) {
            gluedPrefixMatch = true;
            gluedExact = true;
            break;
          } else if (wordMatchesFuzzy(prefix, words[0]!)) {
            gluedPrefixMatch = true;
            gluedExact = false;
            break;
          }
        }
      }
      if (gluedPrefixMatch) {
        aliasPrefix = true;
        aliasOwners.add(candidate.callsign);
        const expected = canonicalTail(candidate.callsign);
        if (expected !== null) {
          const baseScore = gluedExact ? 2 : 1;
          if (tailStr === expected) {
            matches.push({ callsign: candidate.callsign, next: i + 1, score: baseScore + 2 });
          } else {
            const expectedDigits = expected.replace(/\D/g, "");
            const expectedSuffix = expected.replace(/\d/g, "");
            const tailDigits = tailStr.replace(/\D/g, "");
            const tailSuffix = tailStr.replace(/\d/g, "");
            if (
              tailDigits.length > 0 &&
              tailDigits === expectedDigits &&
              (tailSuffix === "" || tailSuffix === expectedSuffix)
            ) {
              matches.push({ callsign: candidate.callsign, next: i + 1, score: baseScore });
            }
          }
        }
      }
    }
  }
  if (aliasOwners.size > 1) return { kind: "ambiguous" };
  if (matches.length === 0) return { kind: aliasPrefix ? "invalid" : "none" };
  const maxScore = Math.max(...matches.map((m) => m.score));
  const bestMatches = matches.filter((m) => m.score === maxScore);
  const unique = [...new Map(bestMatches.map((match) => [match.callsign, match])).values()];
  if (unique.length === 1) return { kind: "ok", ...unique[0] };
  if (unique.length > 1) return { kind: "ambiguous" };
  return { kind: "invalid" };
}

/** Rewrite only a complete leading alias for the typed tokenizer. */
export function rewriteLeadingAliasCallsign(
  normalized: string,
  roster: readonly CallsignRosterEntry[],
): string {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  const alias = aliasCallsignAt(tokens, 0, roster);
  if (alias.kind !== "ok") return normalized;
  return [alias.callsign!, ...tokens.slice(alias.next!)].join(" ");
}

/**
 * Optional callsign at the start of a spoken utterance.
 * Canonical flight number is digit-by-digit (`one two three` → `123`).
 * Compact ASR digits (`203`) are accepted after telephony (`Southwest 203` → `SWA203`).
 * Glued ASR (`American201`) is the same mapping without a space.
 */
export function parseSpokenCallsign(
  tokens: readonly string[],
  i: number,
  roster: readonly CallsignRosterEntry[] = [],
): CallsignAttempt {
  const afterCallsign = (next: number): number => (tokens[next] === "heavy" ? next + 1 : next);
  const first = tokens[i];
  if (first === undefined || RESERVED_SPOKEN.has(first)) {
    return { kind: "none" };
  }

  const compact = first.toUpperCase();
  if (FULL_CALLSIGN.test(compact) || GA_CALLSIGN.test(compact) || SUFFIX_CALLSIGN.test(compact)) {
    return { kind: "ok", callsign: compact, next: afterCallsign(i + 1) };
  }

  const november = parseNovemberTail(tokens, i);
  if (november) {
    return {
      kind: "ok",
      callsign: november.callsign,
      next: afterCallsign(november.next),
    };
  }

  // FAA identity analog: model/manufacturer plus complete registration tail.
  // Trainer delta: alias tails must be exact; no session abbreviation or fuzzy repair.
  const alias = aliasCallsignAt(tokens, i, roster);
  if (alias.kind === "ok") {
    return {
      kind: "ok",
      callsign: alias.callsign!,
      next: afterCallsign(alias.next!),
      alias: true,
    };
  }
  if (alias.kind === "invalid" || alias.kind === "ambiguous") {
    return { kind: "invalid_alias" };
  }

  const tel = matchTelephony(tokens, i);
  if (tel) {
    const flight = parseFlightNumber(tokens, tel.next);
    if (flight) {
      return {
        kind: "ok",
        callsign: `${tel.icao}${flight.value}`,
        next: afterCallsign(flight.next),
      };
    }
  }

  const glued = matchGluedTelephony(first);
  if (glued) {
    return { kind: "ok", callsign: `${glued.icao}${glued.flight}`, next: afterCallsign(i + 1) };
  }

  const icao = parseSpokenIcao(tokens, i);
  if (icao) {
    return { kind: "ok", callsign: icao.callsign, next: afterCallsign(icao.next) };
  }

  const flightAfter = parseFlightNumber(tokens, i + 1);
  if (flightAfter && !RESERVED_SPOKEN.has(first) && !(first in PHONETIC_TO_LETTER)) {
    return { kind: "unknown_telephony", word: first };
  }

  return { kind: "none" };
}

/** ICAO token from the start of a normalized spoken string, or null. */
export function spokenCallsignToken(normalized: string): string | null {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  const attempt = parseSpokenCallsign(tokens, 0);
  return attempt.kind === "ok" ? attempt.callsign : null;
}

const ICAO_PREFIX_FLIGHT = /^([A-Z]{3})(\d{1,4}[A-Z]?)$/;

export function icaoFlightSuffix(callsign: string): string | null {
  const match = callsign.toUpperCase().match(ICAO_PREFIX_FLIGHT);
  return match ? match[2]! : null;
}

/** Flight number spoken at the start (`giblet 204` / `two zero four`). */
export function spokenFlightNumberHint(normalized: string): string | null {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  if (tokens.length === 0) {
    return null;
  }
  const first = parseFlightNumber(tokens, 0);
  if (first && (singleDigit(tokens[0]) !== null || compactFlightNumber(tokens[0]))) {
    return first.value;
  }
  const afterCarrier = parseFlightNumber(tokens, 1);
  return afterCarrier?.value ?? null;
}

/**
 * Snap a Path C / ASR token onto the live roster. Unique flight-number suffix
 * (`204` vs `SWA204`) wins; never invent a callsign that is not on frequency.
 */
export function groundCallsignToRoster(
  token: string | null,
  normalized: string,
  roster: readonly CallsignRosterEntry[],
): string | null {
  const list = [
    ...new Set(
      roster
        .map((entry) => (typeof entry === "string" ? entry : entry.callsign).trim().toUpperCase())
        .filter((cs) => cs.length > 0),
    ),
  ];
  function uniqueSuffix(hint: string | null): string | null {
    if (!hint) {
      return null;
    }
    const hits = list.filter((cs) => icaoFlightSuffix(cs) === hint);
    if (hits.length === 1) {
      return hits[0]!;
    }
    // A selected aircraft is not evidence that an explicit spoken callsign
    // refers to it. Ambiguous suffixes must remain unresolved.
    return null;
  }

  if (list.length === 0) {
    return token ? token.toUpperCase() : null;
  }

  if (token) {
    const up = token.toUpperCase();
    if (list.includes(up)) {
      return up;
    }
    const fromToken = uniqueSuffix(icaoFlightSuffix(up));
    if (fromToken) {
      return fromToken;
    }
  }

  const alias = aliasCallsignAt(
    normalized.split(" ").filter((tok) => tok.length > 0),
    0,
    roster,
  );
  if (alias.kind === "ok") {
    return alias.callsign!;
  }
  if (alias.kind === "ambiguous" || alias.kind === "invalid") {
    return null;
  }

  const spoken = spokenCallsignToken(normalized);
  if (spoken && list.includes(spoken)) {
    return spoken;
  }

  const fromHint = uniqueSuffix(spokenFlightNumberHint(normalized));
  if (fromHint) {
    return fromHint;
  }

  return token ? token.toUpperCase() : null;
}
