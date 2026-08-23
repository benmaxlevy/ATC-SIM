/**
 * Display readbacks keep numerals (`Delta 123`, `heading 270`).
 * TTS speaks grouped numbers (`one twenty three`, `two seventy`) and omits
 * altitude parentheticals. `hundred` / `thousand` only when the rest is zeros.
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
  return text
    .replace(/\s*\(\d+\)/g, "")
    .replace(/\d+/g, (digits) => speakGroupedNumber(digits))
    .replace(/\s+/g, " ")
    .trim();
}
