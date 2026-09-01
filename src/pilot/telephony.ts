/**
 * Minimum ICAO → telephony map for v1 readbacks.
 * Unknown 3-letter prefixes use the FAA/ICAO phonetic alphabet, not English
 * letter names (`XYZ99` → `X-ray Yankee Zulu 99`).
 */
export const AIRLINE_TELEPHONY: Readonly<Record<string, string>> = {
  DAL: "Delta",
  AAL: "American",
  UAL: "United",
  SWA: "Southwest",
  JBU: "JetBlue",
  FFT: "Frontier",
  ASA: "Alaska",
  SKW: "Skywest",
  EDV: "Endeavor",
  RPA: "Brickyard",
  FDX: "FedEx",
  UPS: "UPS",
};

/** NATO/FAA phonetic (JO 7110.65). `X-ray` keeps the ticket hyphen. */
export const FAA_PHONETIC: Readonly<Record<string, string>> = {
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

function speakPhoneticLetter(letter: string): string {
  return FAA_PHONETIC[letter] ?? letter.toUpperCase();
}

/** Letters as FAA phonetic (title case); consecutive digits stay grouped numerals. */
export function speakAlphanumeric(text: string): string {
  const chars = [...text.toUpperCase()].filter((ch) => /[A-Z0-9]/.test(ch));
  const parts: string[] = [];
  let digits = "";
  for (const ch of chars) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    if (digits) {
      parts.push(digits);
      digits = "";
    }
    parts.push(speakPhoneticLetter(ch));
  }
  if (digits) {
    parts.push(digits);
  }
  return parts.join(" ");
}

/**
 * `DAL123` → `Delta 123`. Unknown `XYZ99` → `X-ray Yankee Zulu 99`.
 */
export function formatCallsignSpeech(callsign: string): string {
  const cs = callsign.trim().toUpperCase();
  if (!cs) {
    return "";
  }
  if (/^[A-Z]{3}/.test(cs)) {
    const prefix = cs.slice(0, 3);
    const rest = cs.slice(3);
    const head = AIRLINE_TELEPHONY[prefix] ?? speakAlphanumeric(prefix);
    const tail = speakAlphanumeric(rest);
    return [head, tail].filter((part) => part.length > 0).join(" ");
  }
  return speakAlphanumeric(cs);
}

export const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "niner",
] as const;

/** One decimal digit, 0–9. */
export function speakDigit(digit: number): string {
  return DIGIT_WORDS[digit] ?? "zero";
}

/** Each character that is 0–9, in order (no padding). `20` → `two zero`. */
export function speakDigitString(value: number | string): string {
  const raw = typeof value === "number" ? String(Math.trunc(Math.abs(value))) : value;
  return [...raw]
    .filter((ch) => ch >= "0" && ch <= "9")
    .map((ch) => speakDigit(Number(ch)))
    .join(" ");
}

/** Consecutive decimal digits, no padding. `20` → `20`. */
export function formatDigitString(value: number | string): string {
  const raw = typeof value === "number" ? String(Math.trunc(Math.abs(value))) : value;
  return [...raw].filter((ch) => ch >= "0" && ch <= "9").join("");
}

/**
 * Magnetic/true heading in `[0, 360)` as three digits. Stored `0` is `360`.
 * `5` → `005`, `90` → `090`, `270` → `270`.
 */
export function formatHeadingDigits(headingDeg: number): string {
  const normalized = ((Math.round(headingDeg) % 360) + 360) % 360;
  const spoken = normalized === 0 ? 360 : normalized;
  return String(spoken).padStart(3, "0");
}

/** US transition: 18,000 ft MSL and above are flight levels. */
export const FLIGHT_LEVEL_FT = 18000;

/** Snap Mode C / assigned altitudes to the nearest 100 ft. */
export function roundAltitudeToHundreds(altitudeFt: number): number {
  if (!Number.isFinite(altitudeFt)) {
    return 0;
  }
  return Math.max(0, Math.round(altitudeFt / 100) * 100);
}

/**
 * Pilot altitude display. Below FL: grouped speech plus hundreds in
 * parentheses (`one-zero thousand (10000)` — TTS strips the paren, then groups
 * remaining numerals). At/above 18,000: `FL 180`.
 */
export function formatAltitude(altitudeFt: number): string {
  const ft = roundAltitudeToHundreds(altitudeFt);
  if (ft >= FLIGHT_LEVEL_FT) {
    return `FL ${ft / 100}`;
  }
  return `${speakAltitude(ft)} (${ft})`;
}

/**
 * Magnetic/true heading in `[0, 360)`. Stored `0` is spoken as `three six zero`.
 * Always three digits: `5` → `zero zero five`, `90` → `zero niner zero`.
 */
export function speakHeading(headingDeg: number): string {
  return speakDigitString(formatHeadingDigits(headingDeg));
}

/**
 * Altitude in feet MSL. Below 10,000: group thousands then hundreds
 * (`three thousand`, `four thousand five hundred`). At/above 10,000: each
 * digit of the thousands group, hyphenated (`one-zero thousand`).
 */
export function speakAltitude(altitudeFt: number): string {
  const ft = roundAltitudeToHundreds(altitudeFt);
  const thousands = Math.floor(ft / 1000);
  const hundreds = Math.floor((ft % 1000) / 100);
  const parts: string[] = [];
  if (thousands >= 10) {
    parts.push(`${speakDigitString(thousands).replaceAll(" ", "-")} thousand`);
  } else if (thousands > 0) {
    parts.push(`${speakDigit(thousands)} thousand`);
  }
  if (hundreds > 0) {
    parts.push(`${speakDigit(hundreds)} hundred`);
  }
  return parts.length > 0 ? parts.join(" ") : "zero";
}

export interface FormatDepartureCheckInArgs {
  callsign: string;
  sidName?: string;
  currentAltitudeFt: number;
  assignedAltitudeFt: number;
  isClimbVia: boolean;
}

/**
 * Departure initial check-in phraseology per AIM 4-2-3 & JO 7110.65.
 * Climb-via: "Departure, Delta 123, passing one thousand two hundred climbing via the DEMO ONE departure"
 * Level / assigned: "Departure, Delta 123, leaving one thousand two hundred for one-zero thousand"
 */
export function formatDepartureCheckIn(args: FormatDepartureCheckInArgs): string {
  const callsignSpeech = formatCallsignSpeech(args.callsign);
  const altFt = roundAltitudeToHundreds(args.currentAltitudeFt);
  const altSpeech = altFt >= FLIGHT_LEVEL_FT ? `FL ${altFt / 100}` : speakAltitude(altFt);

  if (args.isClimbVia && args.sidName) {
    return `Departure, ${callsignSpeech}, passing ${altSpeech} climbing via the ${args.sidName} departure`;
  }
  const assignedFt = roundAltitudeToHundreds(args.assignedAltitudeFt);
  const assignedAltSpeech =
    assignedFt >= FLIGHT_LEVEL_FT ? `FL ${assignedFt / 100}` : speakAltitude(assignedFt);
  return `Departure, ${callsignSpeech}, leaving ${altSpeech} for ${assignedAltSpeech}`;
}
