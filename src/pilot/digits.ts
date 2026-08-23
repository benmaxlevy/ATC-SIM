/**
 * FAA number speech for readbacks (AIM / JO 7110.65 digits).
 * 9 is always "niner", 0 is always "zero". Headings are digit-by-digit.
 */

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

/** Rounded altitude in feet MSL as a number. */
export function formatAltitudeDigits(altitudeFt: number): string {
  return String(roundAltitudeToHundreds(altitudeFt));
}

/**
 * Pilot altitude display. Below FL: grouped speech plus hundreds in
 * parentheses (`one-zero thousand (10000)` — TTS strips the paren). At/above
 * 18,000: `FL 180`.
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
