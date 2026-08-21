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

/**
 * Magnetic/true heading in `[0, 360)`. Stored `0` is spoken as `three six zero`.
 * Always three digits: `5` → `zero zero five`, `90` → `zero niner zero`.
 */
export function speakHeading(headingDeg: number): string {
  const normalized = ((Math.round(headingDeg) % 360) + 360) % 360;
  const spoken = normalized === 0 ? 360 : normalized;
  return speakDigitString(String(spoken).padStart(3, "0"));
}

/**
 * Altitude in feet MSL. Below 10,000: group thousands then hundreds
 * (`three thousand`, `four thousand five hundred`). At/above 10,000: each
 * digit of the thousands group (`one one thousand`). Never "flight level".
 */
export function speakAltitude(altitudeFt: number): string {
  const ft = Math.max(0, Math.round(altitudeFt));
  const thousands = Math.floor(ft / 1000);
  const hundreds = Math.floor((ft % 1000) / 100);
  const parts: string[] = [];
  if (thousands >= 10) {
    parts.push(`${speakDigitString(thousands)} thousand`);
  } else if (thousands > 0) {
    parts.push(`${speakDigit(thousands)} thousand`);
  }
  if (hundreds > 0) {
    parts.push(`${speakDigit(hundreds)} hundred`);
  }
  return parts.length > 0 ? parts.join(" ") : "zero";
}
