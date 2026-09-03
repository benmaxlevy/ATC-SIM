/**
 * Systematic lemmatization and orthographic normalization for ATC speech (Phase 3).
 *
 * Handles:
 * - English verb lemmatization:
 *   - Past tense / past participle (-ed): maintained -> maintain, turned -> turn, climbed -> climb,
 *     descended -> descend, intercepted -> intercept, cleared -> clear, reduced -> reduce,
 *     increased -> increase, expedited -> expedite, etc.
 *   - Progressive (-ing): descending -> descend, turning -> turn, climbing -> climb, proceeding -> proceed, etc.
 *   - 3rd person singular (-s, -es): maintains -> maintain, crosses -> cross, etc.
 *   - Common irregulars: flew -> fly, sped -> speed, held -> hold, etc.
 * - Guardrails:
 *   - Numbers, flight numbers (DAL123), runway designations (26L, 26R), recognized fixes/navaids
 *   - Critical ATC keywords: heading, degrees, knots, miles, speed, proceed, feet, established
 *   - Telephony callsigns: united, american, express, etc.
 * - Orthographic normalization (US/UK spelling canonicalization):
 *   - -our -> -or: endeavour -> endeavor (matching EDV in telephony.json), colour -> color, harbour -> harbor
 *   - centre -> center
 */

import { isNumberish } from "./numbers";

/** Protected words with -our that are NOT British spellings and must not be altered. */
const PROTECTED_OUR = new Set([
  "our",
  "ours",
  "hour",
  "hours",
  "four",
  "fours",
  "fourteen",
  "fourth",
  "sour",
  "tour",
  "tours",
  "pour",
  "poured",
  "pouring",
  "pours",
  "scour",
  "scoured",
  "scouring",
  "scours",
  "flour",
  "flours",
  "course",
  "court",
  "courage",
  "encourage",
  "journey",
  "resource",
]);

/**
 * Orthographic normalization (UK/US spelling canonicalization):
 * - `-our` -> `-or`: `endeavour` -> `endeavor`, `colour` -> `color`, `harbour` -> `harbor`
 * - `centre` -> `center`
 */
export function normalizeOrthography(token: string): string {
  const lower = token.toLowerCase();

  if (lower === "centre") {
    return "center";
  }
  if (lower === "centres") {
    return "centers";
  }

  if (PROTECTED_OUR.has(lower)) {
    return lower;
  }

  // Matches words ending in our, ours, oured, ouring where preceding character is a letter
  if (/[a-z]{2,}our(s|ed|ing)?$/i.test(lower)) {
    return lower.replace(/our(s|ed|ing)?$/i, "or$1");
  }

  return lower;
}

export function normalizeOrthographyTokens(tokens: readonly string[]): string[] {
  return tokens.map(normalizeOrthography);
}

/** Common irregular ATC verbs. */
const IRREGULAR_VERBS: Readonly<Record<string, string>> = {
  flew: "fly",
  sped: "speed",
  held: "hold",
  went: "go",
  ran: "run",
  spoke: "speak",
  taken: "take",
  took: "take",
};

/**
 * Explicit ATC verb inflection table mapping inflected forms to their base lemma.
 * Ensures 100% deterministic reduction for all verbs in standard ATC phraseology.
 */
const ATC_VERB_MAP: Readonly<Record<string, string>> = {
  // maintain
  maintained: "maintain",
  maintaining: "maintain",
  maintains: "maintain",

  // turn
  turned: "turn",
  turning: "turn",
  turns: "turn",

  // climb
  climbed: "climb",
  climbing: "climb",
  climbs: "climb",

  // descend
  descended: "descend",
  descending: "descend",
  descends: "descend",

  // intercept
  intercepted: "intercept",
  intercepting: "intercept",
  intercepts: "intercept",

  // clear
  cleared: "clear",
  clearing: "clear",
  clears: "clear",

  // reduce
  reduced: "reduce",
  reducing: "reduce",
  reduces: "reduce",

  // increase
  increased: "increase",
  increasing: "increase",
  increases: "increase",

  // expedite
  expedited: "expedite",
  expediting: "expedite",
  expedites: "expedite",

  // cross
  crossed: "cross",
  crossing: "cross",
  crosses: "cross",

  // proceed
  proceeded: "proceed",
  proceeding: "proceed",
  proceeds: "proceed",

  // speed
  speeded: "speed",
  speeding: "speed",
  speeds: "speed",

  // fly
  flying: "fly",
  flies: "fly",

  // hold
  holding: "hold",
  holds: "hold",

  // slow
  slowed: "slow",
  slowing: "slow",
  slows: "slow",

  // resume
  resumed: "resume",
  resuming: "resume",
  resumes: "resume",

  // contact
  contacted: "contact",
  contacting: "contact",
  contacts: "contact",

  // squawk
  squawked: "squawk",
  squawk: "squawk",
  squawking: "squawk",
  squawks: "squawk",

  // join
  joined: "join",
  joining: "join",
  joins: "join",

  // follow
  followed: "follow",
  following: "follow",
  follows: "follow",

  // depart
  departed: "depart",
  departing: "depart",
  departs: "depart",

  // expect
  expected: "expect",
  expecting: "expect",
  expects: "expect",

  // report
  reported: "report",
  reporting: "report",
  reports: "report",

  // request
  requested: "request",
  requesting: "request",
  requests: "request",

  // enter
  entered: "enter",
  entering: "enter",
  enters: "enter",

  // circle
  circled: "circle",
  circling: "circle",
  circles: "circle",

  // taxi
  taxied: "taxi",
  taxiing: "taxi",
  taxis: "taxi",

  // stop
  stopped: "stop",
  stopping: "stop",
  stops: "stop",

  // continue
  continued: "continue",
  continuing: "continue",
  continues: "continue",

  // vector
  vectored: "vector",
  vectoring: "vector",
  vectors: "vector",

  // level
  leveled: "level",
  leveling: "level",
  levels: "level",

  // ident
  identified: "ident",
  identing: "ident",
  idented: "ident",
  idents: "ident",
};

/** Tokens that MUST NEVER have suffixes stripped. */
const PROTECTED_WORDS = new Set([
  // Core ATC keywords that end in -ing, -s, -es, or -ed
  "heading", // MUST NOT become head
  "degrees", // MUST NOT become degree
  "knots", // MUST NOT become knot
  "miles", // MUST NOT become mile
  "speed", // MUST NOT become sp
  "proceed", // MUST NOT become proc
  "feet",
  "foot",
  "established", // "until established"
  "runway",
  "approach",
  "localizer",
  "altitude",
  "flight",
  "level",
  "direct",
  "via",
  "cross", // base ends in -ss
  "pass", // base ends in -ss
  "press", // base ends in -ss
  "miss", // base ends in -ss
  "this",
  "yes",
  "status",
  "flaps",
  "always",
  "during",
  "boeing",
  "airbus",

  // Telephony callsigns and parts
  "united", // United Airlines (UAL) — MUST NOT become unit!
  "express", // Federal Express
  "american",
  "delta",
  "southwest",
  "jetblue",
  "alaska",
  "frontier",
  "fedex",
  "ups",
  "brickyard",
  "skywest",
  "endeavor",
  "hawaiian",
  "canada",
  "speedbird",
]);

/**
 * Checks if a token is a runway designator (e.g. 26L, 26R, 09C, RW26R).
 */
function isRunwayDesignation(token: string): boolean {
  return /^(rw|rwy)?\d{1,2}[lrc]?$/i.test(token);
}

/**
 * Checks if a token looks like an aircraft flight number (e.g. DAL123, AAL456, N172SP, FL350, H270).
 */
function isFlightOrAlphanumeric(token: string): boolean {
  return /\d/.test(token);
}

/**
 * Rule-based fallback suffix reduction for English verbs.
 */
function ruleBasedLemmatize(token: string): string {
  // If <= 3 characters, do not strip (e.g. is, as, us, red, led)
  if (token.length <= 3) {
    return token;
  }

  // Past tense -ed
  if (token.endsWith("ed")) {
    // Keep words ending in -eed (e.g. speed, proceed, exceed, need, feed)
    if (token.endsWith("eed")) {
      return token;
    }
    // -ied -> -y (e.g. identified -> identify, clarified -> clarify)
    if (token.endsWith("ied") && token.length > 4) {
      return token.slice(0, -3) + "y";
    }
    // Double consonant + ed (e.g. stopped -> stop)
    if (
      token.length > 5 &&
      token[token.length - 3] === token[token.length - 4] &&
      /[b-df-hj-np-tv-z]/.test(token[token.length - 3]!)
    ) {
      return token.slice(0, -3);
    }
    return token.slice(0, -2);
  }

  // Progressive -ing
  if (token.endsWith("ing")) {
    // Length <= 4: wing, ring, sing, king
    if (token.length <= 4) {
      return token;
    }
    // Double consonant + ing (e.g. stopping -> stop)
    if (
      token.length > 6 &&
      token[token.length - 4] === token[token.length - 5] &&
      /[b-df-hj-np-tv-z]/.test(token[token.length - 4]!)
    ) {
      return token.slice(0, -4);
    }
    return token.slice(0, -3);
  }

  // 3rd person singular -es / -s
  if (token.endsWith("es")) {
    if (token.endsWith("sses")) {
      return token.slice(0, -2); // crosses -> cross, passes -> pass
    }
    if (token.endsWith("ches") || token.endsWith("shes") || token.endsWith("xes")) {
      return token.slice(0, -2);
    }
    if (token.endsWith("ies") && token.length > 4) {
      return token.slice(0, -3) + "y"; // flies -> fly
    }
    return token.slice(0, -1); // reduces -> reduce, increases -> increase
  }

  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

/**
 * Lemmatizes a single spoken token according to ATC English verb rules with strict guardrails.
 */
export function lemmatizeToken(
  rawToken: string,
  recognizedFixes?: ReadonlySet<string> | readonly string[],
): string {
  const token = rawToken.toLowerCase().trim();

  if (token.length === 0) {
    return "";
  }

  // Guardrail: Numbers, flight numbers, runway designations
  if (isFlightOrAlphanumeric(token) || isRunwayDesignation(token) || isNumberish(token)) {
    return token;
  }

  // Guardrail: Recognized fixes / navaids
  if (recognizedFixes) {
    const upper = token.toUpperCase();
    if (
      recognizedFixes instanceof Set
        ? recognizedFixes.has(upper) || recognizedFixes.has(token)
        : (recognizedFixes as readonly string[]).includes(upper) ||
          (recognizedFixes as readonly string[]).includes(token)
    ) {
      return token;
    }
  }

  // Guardrail: Protected ATC keywords and telephony
  if (PROTECTED_WORDS.has(token)) {
    return token;
  }

  // Irregular verbs
  if (token in IRREGULAR_VERBS) {
    return IRREGULAR_VERBS[token]!;
  }

  // Explicit ATC verb map
  if (token in ATC_VERB_MAP) {
    return ATC_VERB_MAP[token]!;
  }

  // Rule-based fallback
  return ruleBasedLemmatize(token);
}

/**
 * Lemmatizes an array of spoken tokens.
 */
export function lemmatizeTokens(
  tokens: readonly string[],
  recognizedFixes?: ReadonlySet<string> | readonly string[],
): string[] {
  return tokens.map((tok) => lemmatizeToken(tok, recognizedFixes));
}
