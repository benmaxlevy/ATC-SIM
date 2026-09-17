/**
 * Display readbacks keep numerals (`Delta 123`, `heading 270`).
 * TTS speaks grouped numbers (`one twenty three`, `two seventy`) and omits
 * altitude parentheticals. `hundred` / `thousand` only when the rest is zeros.
 * VFR N-numbers speak digit-by-digit with phonetics
 * (`N127S` → `November one two seven Sierra`), and airport/fix/navaid codes
 * in identifier positions speak as phonetics (`KATL` → `Kilo Alfa Tango Lima`).
 * Procedure names (`DEMO ONE`) and airline callsign grouping are untouched.
 */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const;

const TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

/**
 * Raw uppercase aviation identifiers are ambiguous to general-purpose TTS.
 * Keep the display readback canonical, but give the speech engine a spelling
 * that cannot turn `KATL` into a guessed word or `ILS` into just `I`.
 */
const TTS_IDENTIFIER_ALIASES: Readonly<Record<string, string>> = {
  ILS: "India Lima Sierra",
  // Flight-rules state is letter-spelled (`squawk VFR` → `squawk V F R`),
  // never NATO phonetic.
  VFR: "V F R",
  IFR: "India Foxtrot Romeo",
  DME: "Delta Mike Echo",
  // STAR/procedure name: spoken word, never spelled.
  DEMO: "Demo",
};

/** NATO/FAA phonetic (JO 7110.65) for TTS identifier expansion. */
const NATO_PHONETIC: Readonly<Record<string, string>> = {
  A: "Alfa",
  B: "Bravo",
  C: "Charlie",
  D: "Delta",
  E: "Echo",
  F: "Foxtrot",
  G: "Golf",
  H: "Hotel",
  I: "India",
  J: "Juliett",
  K: "Kilo",
  L: "Lima",
  M: "Mike",
  N: "November",
  O: "Oscar",
  P: "Papa",
  Q: "Quebec",
  R: "Romeo",
  S: "Sierra",
  T: "Tango",
  U: "Uniform",
  V: "Victor",
  W: "Whiskey",
  X: "X-ray",
  Y: "Yankee",
  Z: "Zulu",
};

/** Single digits per JO 7110.65 (`9` → `niner`). */
const SINGLE_DIGIT_WORDS: Readonly<Record<string, string>> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "niner",
};

/** One identifier character: letter → phonetic, digit → single word. */
function speakIdentifierChar(ch: string): string {
  if (ch >= "0" && ch <= "9") {
    return SINGLE_DIGIT_WORDS[ch]!;
  }
  return NATO_PHONETIC[ch] ?? ch;
}

/** Airport/fix/navaid code → phonetics (`KATL` → `Kilo Alfa Tango Lima`). */
function speakIdentifier(token: string): string {
  return [...token].map(speakIdentifierChar).join(" ");
}

/**
 * Aircraft type → letter-spelled with single digits (`SR22` → `S R 2 2`).
 * Digits stay numerals here so the grouped-number pass speaks each singly.
 */
function spellAircraftType(token: string): string {
  return [...token].join(" ");
}

/** VFR N-number → phonetics with single digits (`N127S` → `November one two seven Sierra`). */
function speakNNumber(token: string): string {
  return `November ${speakIdentifier(token.slice(1))}`;
}

function hasLetter(token: string): boolean {
  return /[A-Z]/.test(token);
}

/**
 * Expand identifiers only in identifier positions so procedure names
 * (`DEMO ONE`, `BAY ONE`) and template words are never touched.
 */
function expandTtsCallsignsAndIdentifiers(text: string): string {
  // Raw VFR N-numbers (`N127S`, `N172SP`). Requires a digit right after `N`
  // so fixes like `NEMAX` never match.
  let out = text.replace(/\bN(\d[A-Z0-9]*)\b/g, (token) => speakNNumber(token));
  // Already-expanded VFR callsigns in controller readbacks
  // (`November 127 Sierra` → `November one two seven Sierra`).
  out = out.replace(
    /\bNovember (\d+)\b/g,
    (_, digits: string) => `November ${[...digits].map((ch) => SINGLE_DIGIT_WORDS[ch]!).join(" ")}`,
  );
  // Fix/navaid reference (`5 miles from DEM`).
  out = out.replace(/\bmiles? from ([A-Z0-9]{2,5})\b/g, (match, token: string) =>
    hasLetter(token) ? match.replace(token, speakIdentifier(token)) : match,
  );
  // Airport in a position report (`15 miles north of KPDK`).
  out = out.replace(
    /\b(north|south|east|west|northeast|northwest|southeast|southwest) of ([A-Z]{3,4})\b/g,
    (_, dir: string, token: string) => `${dir} of ${speakIdentifier(token)}`,
  );
  // Clearance limit / flight-following destination (`cleared to KATL`, `following to KFTY`).
  out = out.replace(
    /\b(cleared|following) to ([A-Z]{3,4})\b/g,
    (_, keyword: string, token: string) => `${keyword} to ${speakIdentifier(token)}`,
  );
  // Tactical fix references (`direct NEMAX`, `cross MERGE`, `until NEMAX`).
  out = out.replace(
    /\b(direct|cross|until) ([A-Z][A-Z0-9]{1,4})\b/g,
    (match, keyword: string, token: string) =>
      hasLetter(token) ? `${keyword} ${speakIdentifier(token)}` : match,
  );
  // VFR aircraft type in the flight-following callup (`, C172, request flight
  // following`). Letter-spelled, never phonetic (`SR22` → `S R 2 2`).
  out = out.replace(/, ([A-Z][A-Z0-9]{1,5}), request flight following/g, (_, token: string) =>
    hasLetter(token) ? `, ${spellAircraftType(token)}, request flight following` : _,
  );
  return out;
}

function expandTtsIdentifiers(text: string): string {
  return text.replace(/\b[A-Z]{3,4}\b/g, (token) => {
    const alias = TTS_IDENTIFIER_ALIASES[token];
    if (alias) {
      return alias;
    }
    return token.length === 4 ? [...token].join(" ") : token;
  });
}

/** Last two digits as English (`23` → `twenty three`, `07` → `seven`). */
function speakTwoDigit(n: number): string {
  if (n < 10) {
    return ONES[n]!;
  }
  if (n < 20) {
    return TEENS[n - 10]!;
  }
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens]! : `${TENS[tens]} ${ONES[ones]}`;
}

/**
 * Grouped number speech: `123` → `one twenty three`, `270` → `two seventy`.
 * `hundred` / `thousand` only when remaining digits are zeros (`100`, `1000`).
 */
export function speakGroupedNumber(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) {
    return digits;
  }
  if (n < 100) {
    return speakTwoDigit(n);
  }
  if (n % 1000 === 0) {
    return `${speakGroupedNumber(n / 1000)} thousand`;
  }
  if (n % 100 === 0) {
    return `${speakGroupedNumber(n / 100)} hundred`;
  }
  const lastTwo = n % 100;
  const rest = Math.floor(n / 100);
  if (lastTwo < 10) {
    return `${speakGroupedNumber(rest)} zero ${ONES[lastTwo]}`;
  }
  return `${speakGroupedNumber(rest)} ${speakTwoDigit(lastTwo)}`;
}

export function readbackForTts(text: string): string {
  // Callsigns/identifiers first: the generic 4-letter spacer below must not
  // shred `KPDK` before the `of KPDK` anchor sees it.
  return expandTtsIdentifiers(expandTtsCallsignsAndIdentifiers(text))
    .replace(/\s*\(\d+\)/g, "")
    .replace(/\d+/g, (digits) => speakGroupedNumber(digits))
    .replace(/\s+/g, " ")
    .trim();
}
